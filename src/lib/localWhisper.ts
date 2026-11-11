import { detectLanguage, worthDetecting } from './langDetect';
import { speechDedupeKey, splitSentences } from './speech';
import type { Lang } from '../types';

/**
 * On-device transcription with Whisper.
 *
 * Why this exists: the Web Speech API in Chrome sends audio to Google and, worse
 * for us, revises text it has already finalised — the source of the repeated
 * words. Whisper running in the page fixes both: the audio never leaves the
 * device, and each utterance is decoded once from start to finish, so there is no
 * revision stream to de-duplicate.
 *
 * The model is fetched on first use and cached by the browser, then works
 * offline. Everything heavy is behind a dynamic import so the app stays small
 * until someone actually turns this on.
 */

export type WhisperModel = 'tiny' | 'base';

export const WHISPER_MODEL_LABEL: Record<WhisperModel, string> = {
  tiny: 'Tiny · ~40 MB · fastest, less accurate',
  base: 'Base · ~80 MB · slower, much better Finnish',
};

const MODEL_ID: Record<WhisperModel, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
};

/** Whisper wants 16 kHz mono. */
const SAMPLE_RATE = 16000;
/** Speech quieter than this is treated as background noise. */
const VOICE_THRESHOLD = 0.008;
/** Silence this long ends an utterance and sends it to the model. */
const SILENCE_MS = 700;
/** Never let one utterance grow past this; decode early instead. */
const MAX_UTTERANCE_MS = 12000;
/** Shorter than this is a cough, not a sentence. */
const MIN_UTTERANCE_MS = 400;

const msToSamples = (ms: number): number => Math.round((SAMPLE_RATE * ms) / 1000);

/** Whisper can hand back the same audio twice across adjacent bubbles. */
const RECENT_DUPLICATE_MS = 5000;

export interface LocalEngineHandlers {
  onSentence: (text: string, lang: Lang, detected: boolean) => void;
  onInterim: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  onFailure: (failure: { code: string; message: string; fatal: boolean }) => void;
  /** 0–100 while the weights download. */
  onProgress?: (progress: { status: 'loading' | 'ready' | 'error'; percent: number; detail: string }) => void;
}

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text?: string } | { text?: string }[]>;

interface ModelCache {
  name: WhisperModel;
  run: Transcriber;
}

let cache: ModelCache | null = null;
let inFlight: { name: WhisperModel; promise: Promise<Transcriber> } | null = null;

export function localWhisperSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) ===
      'function'
  );
}

/** True when the weights are already downloaded and decode can start at once. */
export function localWhisperReady(): boolean {
  return cache !== null;
}

async function loadTranscriber(
  model: WhisperModel,
  onProgress?: LocalEngineHandlers['onProgress'],
): Promise<Transcriber> {  if (cache?.name === model) return cache.run;
  if (inFlight?.name === model) return inFlight.promise;

  const promise = (async () => {
    onProgress?.({ status: 'loading', percent: 0, detail: `Fetching the ${model} model…` });
    const mod = (await import('@huggingface/transformers')) as unknown as {
      pipeline: (task: string, id: string, opts?: Record<string, unknown>) => Promise<unknown>;
      env: { allowRemoteModels?: boolean; useBrowserCache?: boolean };
    };

    // Remote weights, cached in the browser — no local files to ship.
    if (mod.env) {
      mod.env.allowRemoteModels = true;
      mod.env.useBrowserCache = true;
    }

    let lastPercent = 0;
    const pipe = (await mod.pipeline('automatic-speech-recognition', MODEL_ID[model], {
      dtype: 'q8',
      progress_callback: (report: { status?: string; progress?: number; file?: string }) => {
        if (report.status !== 'progress' || typeof report.progress !== 'number') return;
        // Many files download in sequence; show the furthest one so far so the bar
        // does not jump backwards between shards.
        const percent = Math.min(99, Math.round(report.progress));
        if (percent < lastPercent) return;
        lastPercent = percent;
        onProgress?.({
          status: 'loading',
          percent,
          detail: `Downloading ${model} model… ${percent}%`,
        });
      },
    })) as unknown as Transcriber;

    cache = { name: model, run: pipe };
    onProgress?.({ status: 'ready', percent: 100, detail: `${model} model ready — works offline now.` });
    return pipe;
  })();

  inFlight = { name: model, promise };
  try {
    return await promise;
  } catch (err) {
    cache = null;
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({
      status: 'error',
      percent: 0,
      detail: `Could not load the model: ${message}`,
    });
    throw err;
  } finally {
    if (inFlight?.promise === promise) inFlight = null;
  }
}

/** Forgets the loaded model, e.g. after a failed first attempt. */
export function unloadLocalModel(): void {
  cache = null;
  inFlight = null;
}

/**
 * Transcribes one float32 buffer. Exposed for the dev probe and for tests; the
 * engine itself goes through this too, so verification exercises the real path.
 */
export async function transcribeWithModel(
  model: WhisperModel,
  audio: Float32Array,
  onProgress?: LocalEngineHandlers['onProgress'],
): Promise<string> {
  const run = await loadTranscriber(model, onProgress);
  const result = await run(audio, { task: 'transcribe', return_timestamps: false });
  return ((Array.isArray(result) ? result[0]?.text : result?.text) ?? '').trim();
}

/**
 * Starts fetching the model without recording anything.
 *
 * Called when the user picks the on-device engine in settings, so the download runs
 * while they are still reading, instead of the first time they press Start.
 */
export async function preloadLocalModel(
  model: WhisperModel,
  onProgress?: LocalEngineHandlers['onProgress'],
): Promise<void> {
  await loadTranscriber(model, onProgress);
}

/**
 * Records from the microphone, cuts the audio at pauses, and transcribes each
 * utterance on the device.
 */
export class LocalWhisperEngine {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private want = false;
  private listening = false;
  private startedAt = 0;
  private chunks: Float32Array[] = [];
  /** Length of everything in `chunks`, in samples. Compare only via samplesToMs. */
  private buffered = 0;
  private lastVoiceAt = 0;
  private ticker: number | null = null;
  private busy = false;
  private disposed = false;
  /** Recently published sentences, so a re-decode cannot duplicate a line. */
  private recent: { key: string; at: number }[] = [];
  /** Language of the last confidently detected utterance; the fallback for short ones. */
  private preferred: Lang = 'fi';

  constructor(
    private model: WhisperModel,
    private handlers: LocalEngineHandlers,
  ) {}

  get isListening(): boolean {
    return this.listening;
  }

  get durationMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  /** Kept for parity with the browser engine; dedupe here is internal. */
  primeKnown(sentences: string[]): void {
    const now = Date.now();
    for (const s of sentences) {
      const key = speechDedupeKey(s);
      if (key) this.recent.push({ key, at: now });
    }
    this.recent = this.recent.slice(-40);
  }

  async start(): Promise<void> {
    if (this.want || this.disposed) return;
    this.want = true;
    this.startedAt = Date.now();

    // Start fetching while the microphone is still being acquired.
    void loadTranscriber(this.model, this.handlers.onProgress).catch(() => {
      /* surfaced again on the first decode */
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (!this.want || this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;

      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('This browser has no Web Audio support.');
      const context = new Ctor({ sampleRate: SAMPLE_RATE });
      this.context = context;

      this.source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      this.processor = processor;
      processor.onaudioprocess = (event) => {
        if (!this.want) return;
        const input = event.inputBuffer.getChannelData(0);
        this.collect(input);
      };
      this.source.connect(processor);
      // A script processor only runs while connected to a destination, but sending
      // the microphone to the speakers would echo the speaker's own voice back at
      // them (and, on a laptop, feed straight into the recogniser). A muted gain
      // node keeps the graph running without making a sound.
      const sink = context.createGain();
      sink.gain.value = 0;
      this.sink = sink;
      processor.connect(sink);
      sink.connect(context.destination);

      this.listening = true;
      this.handlers.onListeningChange(true);
    } catch (err) {
      this.want = false;
      const name = err instanceof DOMException ? err.name : '';
      this.handlers.onFailure({
        code: name || 'start-failed',
        message:
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Microphone permission was denied. Allow it for this site, or type your sentences instead.'
            : name === 'NotFoundError' || name === 'DevicesNotFoundError'
              ? 'No microphone was found on this device.'
              : name === 'NotReadableError'
                ? 'The microphone is being used by another application.'
                : `The microphone could not be started: ${err instanceof Error ? err.message : String(err)}`,
        fatal: true,
      });
      return;
    }

    // Decode on a timer rather than on every audio block: the model takes far
    // longer than a block to run, and a pause is a much better cut point than a
    // fixed buffer size.
    this.lastVoiceAt = Date.now();
    this.ticker = window.setInterval(() => {
      if (!this.listening || this.busy) return;
      if (this.buffered < msToSamples(MIN_UTTERANCE_MS)) return;
      const silentFor = Date.now() - this.lastVoiceAt;
      if (silentFor >= SILENCE_MS || this.buffered >= msToSamples(MAX_UTTERANCE_MS)) {
        void this.transcribe();
      }
    }, 250);
  }

  async stop(): Promise<void> {
    this.want = false;
    if (this.ticker != null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
    // Whatever was said just before Stop still counts.
    if (this.buffered >= msToSamples(MIN_UTTERANCE_MS) && !this.busy) {
      await this.transcribe();
    }
    const wasListening = this.listening;
    this.listening = false;
    this.handlers.onInterim('');
    this.teardown();
    this.chunks = [];
    this.buffered = 0;
    if (wasListening) this.handlers.onListeningChange(false);
  }

  dispose(): void {
    this.disposed = true;
    this.want = false;
    if (this.ticker != null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
    this.teardown();
  }

  private teardown(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      try {
        this.processor.disconnect();
      } catch {
        /* already detached */
      }
      this.processor = null;
    }
    if (this.sink) {
      try {
        this.sink.disconnect();
      } catch {
        /* already detached */
      }
      this.sink = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        /* already detached */
      }
      this.source = null;
    }
    if (this.context) {
      void this.context.close().catch(() => undefined);
      this.context = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  /** Keeps voiced audio, drops the silence around it. */
  private collect(input: Float32Array): void {
    let sum = 0;
    for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    const voiced = rms >= VOICE_THRESHOLD;

    if (voiced) {
      this.lastVoiceAt = Date.now();
      // Do not lead an utterance with a long silence.
      if (this.buffered === 0) {
        this.chunks.push(new Float32Array(input));
        this.buffered = input.length;
        return;
      }
    } else if (this.buffered === 0) {
      return;
    }

    this.chunks.push(new Float32Array(input));
    this.buffered += input.length;

    // Guard the buffer even when nobody stops talking: one endless utterance would
    // otherwise grow without limit while the decoder waits for a pause.
    if (this.buffered >= msToSamples(MAX_UTTERANCE_MS + 2000)) {
      void this.transcribe();
    }
  }

  private async transcribe(): Promise<void> {
    if (this.busy || this.chunks.length === 0) return;
    const audio = this.flatten();
    this.chunks = [];
    this.buffered = 0;
    if (audio.length < msToSamples(MIN_UTTERANCE_MS)) return;

    this.busy = true;
    try {
      const run = await loadTranscriber(this.model, this.handlers.onProgress);
      const result = await run(audio, { task: 'transcribe', return_timestamps: false });
      const text = (Array.isArray(result) ? result[0]?.text : result?.text) ?? '';
      this.publish(text.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.handlers.onFailure({
        code: 'decode-failed',
        message: `The on-device model could not transcribe that. ${message} Switch to the browser engine in settings, or keep typing — nothing is lost.`,
        fatal: false,
      });
    } finally {
      this.busy = false;
    }
  }

  private flatten(): Float32Array {
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  /**
   * Splits the transcript into sentences and works out which language each is.
   *
   * An utterance too short to judge — "ok", "joo", a name — keeps the language that
   * was last in play rather than being forced to Finnish, which would translate an
   * English "thank you" the wrong way.
   */
  private publish(text: string): void {
    if (!text) return;
    const now = Date.now();
    for (const sentence of splitSentences(text)) {
      const key = speechDedupeKey(sentence);
      if (key) {
        // Whisper can return the same audio twice across adjacent bubbles; the
        // window is short so a genuinely repeated phrase is still written down.
        const seen = this.recent.find((r) => r.key === key && now - r.at < RECENT_DUPLICATE_MS);
        if (seen) continue;
        this.recent.push({ key, at: now });
        this.recent = this.recent.slice(-40);
      }
      const verdict = worthDetecting(sentence) ? detectLanguage(sentence) : null;
      const lang: Lang = verdict?.lang ?? this.preferred;
      if (verdict?.lang) this.preferred = verdict.lang;
      this.handlers.onSentence(sentence, lang, verdict?.lang != null);
    }
  }
}
