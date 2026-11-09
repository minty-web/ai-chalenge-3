import {
  SentenceSplitter,
  describeSpeechError,
  getRecognitionCtor,
  splitSentences,
  speechDedupeKey,
  type RecognitionFailure,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from './speech';

export interface SpeechEngineHandlers {
  onFinalSentence: (sentence: string) => void;
  onInterim: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  onFailure: (failure: RecognitionFailure) => void;
}

type FlushReason = 'terminator' | 'silence' | 'max-length' | 'stop';

const SILENCE_MS = 900;
const MAX_BUFFER = 240;
const MAX_RESTARTS = 8;
const RECENT_DUPLICATE_MS = 4000;

/**
 * Owns one `SpeechRecognition` instance at a time and keeps it alive.
 *
 * Chrome ends recognition after a short pause, so `onend` restarts it while the
 * user still wants to record. Finished text is buffered until it looks like a
 * sentence (terminator) or the speaker pauses, then emitted once — the splitter
 * guarantees a sentence is never added twice.
 */
export class SpeechEngine {
  private rec: SpeechRecognitionLike | null = null;
  private want = false;
  private listening = false;
  private buffer = '';
  private timer: number | null = null;
  private restartTimer: number | null = null;
  private restarts = 0;
  private networkFailures = 0;
  private disposed = false;
  private startedAt = 0;
  private lastEmitKey = '';
  private lastEmitAt = 0;
  private splitter = new SentenceSplitter();

  constructor(
    private locale: string,
    private readonly handlers: SpeechEngineHandlers,
  ) {}

  get isListening(): boolean {
    return this.listening;
  }

  get durationMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  setLocale(locale: string): void {
    this.locale = locale;
    if (this.rec) {
      try {
        this.rec.lang = locale;
      } catch {
        // Applied on the next start instead.
      }
    }
  }

  primeKnown(sentences: string[]): void {
    this.splitter.prime(sentences);
  }

  start(): void {
    if (this.disposed || this.want) return;
    this.want = true;
    this.startedAt = Date.now();
    this.restarts = 0;
    this.networkFailures = 0;
    this.spawn();
  }

  private spawn(): void {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      this.want = false;
      this.handlers.onFailure({
        code: 'unsupported',
        message: 'Speech recognition is not available in this browser. Use the text box instead.',
        fatal: true,
      });
      return;
    }

    const rec = new Ctor();
    rec.lang = this.locale;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.listening = true;
      this.restarts = 0;
      this.networkFailures = 0;
      this.handlers.onListeningChange(true);
    };

    rec.onresult = (event) => this.handleResult(event);

    rec.onerror = (event) => {
      const failure = describeSpeechError(event);
      if (failure.code === 'network') {
        this.networkFailures += 1;
        if (this.networkFailures >= 3) {
          this.want = false;
          this.handlers.onFailure({
            ...failure,
            fatal: true,
            message:
              'Speech recognition lost its network connection three times. Check your connection, then start recording again — or type your sentences.',
          });
          return;
        }
      }
      if (failure.fatal) {
        this.want = false;
        this.listening = false;
        this.handlers.onListeningChange(false);
      }
      if (failure.code === 'aborted') return;
      this.handlers.onFailure(failure);
    };

    rec.onend = () => {
      this.listening = false;
      this.handlers.onListeningChange(false);
      this.flush('stop');
      if (!this.want || this.disposed) return;
      this.scheduleRestart();
    };

    this.rec = rec;
    try {
      rec.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/already started/i.test(message)) return;
      this.handlers.onFailure({
        code: 'start-failed',
        message: `The microphone could not be started: ${message}`,
        fatal: true,
      });
      this.want = false;
      this.listening = false;
      this.handlers.onListeningChange(false);
    }
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    let interim = '';
    let appended = false;

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? '';
      if (!transcript) continue;
      if (result.isFinal) {
        this.buffer = `${this.buffer} ${transcript}`.trim();
        appended = true;
      } else {
        interim += transcript;
      }
    }

    this.handlers.onInterim(interim.trim());

    if (!appended) return;

    const endsWithTerminator = /[.!?…]$/.test(this.buffer.trim());
    if (endsWithTerminator) {
      this.clearTimer();
      this.flush('terminator');
      return;
    }
    if (this.buffer.length >= MAX_BUFFER) {
      this.clearTimer();
      this.flush('max-length');
      return;
    }
    this.scheduleSilenceFlush();
  }

  private scheduleSilenceFlush(): void {
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.flush('silence');
    }, SILENCE_MS);
  }

  private clearTimer(): void {
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(sentence: string): void {
    const key = speechDedupeKey(sentence);
    const now = Date.now();
    if (key && key === this.lastEmitKey && now - this.lastEmitAt < RECENT_DUPLICATE_MS) return;
    for (const fresh of this.splitter.push(sentence)) {
      this.lastEmitKey = speechDedupeKey(fresh);
      this.lastEmitAt = Date.now();
      this.handlers.onFinalSentence(fresh);
    }
  }

  private flush(reason: FlushReason): void {
    const text = this.buffer.trim();
    this.buffer = '';
    if (!text) return;

    const sentences = splitSentences(text);
    if (sentences.length === 0) return;

    let emit = sentences;
    if (reason === 'terminator' || reason === 'max-length') {
      const last = sentences[sentences.length - 1];
      if (!/[.!?…]$/.test(last)) {
        emit = sentences.slice(0, -1);
        this.buffer = last;
      }
    }
    for (const sentence of emit) this.emit(sentence);
  }

  private scheduleRestart(): void {
    if (this.restartTimer != null) window.clearTimeout(this.restartTimer);
    if (this.restarts >= MAX_RESTARTS) {
      this.want = false;
      this.handlers.onFailure({
        code: 'restart-exhausted',
        message:
          'Recognition kept stopping, so it was paused. Your saved sentences are safe — click Start recording to continue.',
        fatal: true,
      });
      return;
    }
    const delay = Math.min(1500, 220 * 2 ** this.restarts);
    this.restarts += 1;
    this.restartTimer = window.setTimeout(() => {
      this.restartTimer = null;
      if (!this.want || this.disposed) return;
      try {
        this.rec?.start();
      } catch {
        this.scheduleRestart();
      }
    }, delay);
  }

  async stop(): Promise<void> {
    this.want = false;
    this.clearTimer();
    if (this.restartTimer != null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.handlers.onInterim('');
    this.flush('stop');

    const rec = this.rec;
    this.rec = null;
    this.listening = false;
    this.handlers.onListeningChange(false);
    if (!rec) return;

    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        // already gone
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    void this.stop();
  }
}