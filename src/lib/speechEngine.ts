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
  private timer: number | null = null;
  private restartTimer: number | null = null;
  private restarts = 0;
  private networkFailures = 0;
  private disposed = false;
  private startedAt = 0;
  private lastEmitKey = '';
  private lastEmitAt = 0;
  private splitter = new SentenceSplitter();
  /**
   * Finalised text per result index, plus the last index already written out.
   *
   * Chrome re-fires a result it has already finalised with revised text: say
   * "Moi miten menee" and it can hand back "Moi", then "Moi miten", then the full
   * line, each of them *final*. Appending those deltas is what turns one sentence
   * into "Moi Moi Moi miten Moi miten menee". The result index does not move when
   * the text is revised, so the index is the unit: a revision overwrites its own
   * slot, and each slot is written to the notebook once, in order.
   */
  private finals = new Map<number, string>();
  /**
   * What has already been written for each index.
   *
   * Kept as text rather than a length so a revision can be checked with
   * `startsWith`: if the browser replaces the words instead of extending them,
   * nothing is emitted for that index — it has already been said.
   */
  private written = new Map<number, string>();

  constructor(
    private locale: string,
    private readonly handlers: SpeechEngineHandlers,
  ) {}

  get isListening(): boolean {
    return this.listening;
  }

  get currentLocale(): string {
    return this.locale;
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

  /**
   * Retune a recogniser that is already running.
   *
   * `setLocale` only changes the value the *next* instance will use, which is
   * useless mid-conversation: Chrome will not re-interpret audio for a new
   * locale. The only way to actually hear the other language is to build a fresh
   * recogniser, so pending text is flushed (attributed to the language it was
   * heard in) and the instance is replaced without breaking the recording
   * session.
   */
  switchLocale(locale: string): void {
    if (locale === this.locale) return;
    this.locale = locale;
    if (!this.want || !this.rec) return;

    this.flush('stop');
    this.handlers.onInterim('');

    const previous = this.rec;
    this.rec = null;
    this.detach(previous);
    try {
      previous.abort();
    } catch {
      // Nothing left to abort.
    }

    // Give the aborted instance a moment to release the microphone before the
    // replacement claims it; starting too early throws InvalidStateError.
    window.setTimeout(() => {
      if (!this.want || this.disposed || this.rec) return;
      this.spawn();
    }, 120);
  }

  private detach(rec: SpeechRecognitionLike | null): void {
    if (!rec) return;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onstart = null;
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

    // A fresh instance reports its results from index 0 again.
    this.finals.clear();
    this.written.clear();

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
    // Reassemble the transcript from the results list instead of appending what is
    // new. Chrome repeats finalised results with revised text — say "Moi miten
    // menee" and it can hand back "Moi", then "Moi miten", then the full line,
    // each marked final. Appending those deltas is exactly what produces "Moi Moi
    // Moi miten Moi miten menee". A revision does not change its index, so each
    // index keeps one slot and the transcript is rebuilt from the slots.
    let interim = '';

    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? '';
      if (!text) continue;
      if (result.isFinal) this.finals.set(i, text);
      else interim += text;
    }

    this.handlers.onInterim(interim.replace(/\s+/g, ' ').trim());

    const pending = this.pendingText();
    if (!pending) return;

    // Emit on the first finished sentence even if a fragment follows it, so the
    // notebook keeps pace with the speaker.
    if (/[.!?…]/.test(pending)) {
      this.clearTimer();
      this.flush('terminator');
      return;
    }
    if (pending.length >= MAX_BUFFER) {
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

  /**
   * The unwritten part of the transcript.
   *
   * For each index the browser is still allowed to revise, whatever was already
   * written is removed from the front. So "Moi miten" after "Moi" yields "miten",
   * and a rewrite that does not extend what was written yields nothing at all.
   */
  private pendingText(): string {
    const chunks: string[] = [];
    for (const [i, text] of [...this.finals.entries()].sort((a, b) => a[0] - b[0])) {
      const already = this.written.get(i) ?? '';
      if (!already) {
        chunks.push(text);
        continue;
      }
      if (!text.startsWith(already)) continue;
      const rest = text.slice(already.length).trim();
      if (rest) chunks.push(rest);
    }
    return chunks.join(' ').replace(/\s+/g, ' ').trim();
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

  /**
   * Writes out whatever part of the pending text is finished.
   *
   * A trailing fragment with no terminator is held back mid-sentence, so "Moi" →
   * "Moi miten" → "Moi miten menee" arrives once, complete, instead of three
   * times growing. Silence, stop and a locale switch write the fragment as-is,
   * because then the speaker has clearly finished.
   */
  private flush(reason: FlushReason): void {
    const pending = this.pendingText();
    if (!pending) return;

    const sentences = splitSentences(pending);
    if (sentences.length === 0) return;

    const last = sentences[sentences.length - 1];
    const midSentence = reason === 'terminator' || reason === 'max-length';
    const holdBack = midSentence && !/[.!?…]$/.test(last);
    const toEmit = holdBack ? sentences.slice(0, -1) : sentences;

    for (const sentence of toEmit) this.emit(sentence);

    // Record what each index has now given us, so its next revision only offers
    // the words that are actually new.
    for (const [i, text] of this.finals) {
      const already = this.written.get(i) ?? '';
      if (text.startsWith(already)) this.written.set(i, text);
    }
    if (holdBack) {
      // The held fragment must be offered again by the next revision, so the
      // highest index forgets it. Re-offering the whole index is harmless: the
      // splitter drops anything already emitted.
      const highest = Math.max(...this.finals.keys());
      if (Number.isFinite(highest)) this.written.set(highest, '');
      // Nothing else will arrive if the speaker has stopped, so give the fragment
      // its own deadline instead of waiting for an event that never comes.
      this.scheduleSilenceFlush();
    }
  }

  /** True when finalised text is waiting to be written out. */
  get hasPending(): boolean {
    return this.pendingText().length > 0;
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