import type { Lang } from '../types';
import { decideListenLanguage } from './langDetect';
import { SpeechEngine } from './speechEngine';
import { LocalWhisperEngine, type LocalEngineHandlers, type WhisperModel } from './localWhisper';
import type { RecognitionFailure } from './speech';

export interface BilingualHandlers {
  /** A finished sentence, with the language it was attributed to. */
  onSentence: (text: string, lang: Lang, detected: boolean) => void;
  /** Unfinished words, for the live row only. */
  onInterim: (text: string, lang: Lang) => void;
  onListeningChange: (listening: boolean) => void;
  onFailure: (failure: RecognitionFailure) => void;
  /**
   * The recogniser was retuned to the other language, because detection decided the
   * speaker had switched.
   */
  onLanguageChange: (lang: Lang) => void;
  /** Model download progress, in local mode only. */
  onProgress?: LocalEngineHandlers['onProgress'];
}

export type AsrEngine = 'browser' | 'local';

export interface ListenerOptions {
  engine?: AsrEngine;
  model?: WhisperModel;
}

/**
 * One microphone, two languages.
 *
 * Two very different recognisers sit behind this class, and the difference
 * matters:
 *
 * - **Browser** (Web Speech API). Instant, no download, but it needs a locale up
 *   front, streams audio to the vendor, and emits *revised* hypotheses several of
 *   which are marked final. A sentence therefore has to be deduplicated, and a
 *   language switch means throwing the recogniser away and building a new one —
 *   which loses the words in flight.
 *
 * - **Local** (Whisper, in the page). Audio never leaves the device, each
 *   utterance is transcribed once as a whole so there is nothing to revise, and
 *   the language is decided from finished text with no restart at all.
 *
 * Both paths publish through the same detection step, so the notebook behaves
 * identically either way.
 */
export class BilingualListener {
  private engine: SpeechEngine | null = null;
  private local: LocalWhisperEngine | null = null;
  private active: Lang;
  private autoDetect: boolean;
  private switching = false;
  private disposed = false;
  private readonly provider: AsrEngine;
  private readonly model: WhisperModel;

  constructor(
    initial: Lang,
    private readonly handlers: BilingualHandlers,
    autoDetect = true,
    /** BCP-47 tag for a language. Defaults to `fi-FI` / `en-US`. */
    private readonly localeFor: (lang: Lang) => string = (lang) => (lang === 'fi' ? 'fi-FI' : 'en-US'),
    options: ListenerOptions = {},
  ) {
    this.active = initial;
    this.autoDetect = autoDetect;
    this.provider = options.engine ?? 'browser';
    this.model = options.model ?? 'base';
  }

  get activeLang(): Lang {
    return this.active;
  }

  get isListening(): boolean {
    return this.local?.isListening ?? this.engine?.isListening ?? false;
  }

  get durationMs(): number {
    return this.local?.durationMs ?? this.engine?.durationMs ?? 0;
  }

  /** Sentences already in the notebook, so nothing is transcribed twice. */
  primeKnown(sentences: string[]): void {
    this.engine?.primeKnown(sentences);
    this.local?.primeKnown(sentences);
  }

  /** Pin a language, or hand control back to detection. */
  setMode(autoDetect: boolean, lang: Lang): void {
    this.autoDetect = autoDetect;
    this.retune(lang);
  }

  async start(): Promise<void> {
    if (this.disposed) return;

    if (this.provider === 'local') {
      if (!this.local) {
        this.local = new LocalWhisperEngine(this.model, {
          onSentence: (sentence, lang, detected) => this.handlers.onSentence(sentence, lang, detected),
          onInterim: (text) => this.handlers.onInterim(text, this.active),
          onListeningChange: (listening) => this.handlers.onListeningChange(listening),
          onFailure: (failure) => this.handlers.onFailure(failure),
          onProgress: this.handlers.onProgress,
        });
      }
      await this.local.start();
      return;
    }

    if (!this.engine) {
      this.engine = new SpeechEngine(this.localeFor(this.active), {
        onFinalSentence: (sentence) => this.handleSentence(sentence),
        onInterim: (text) => this.handleInterim(text),
        onListeningChange: (listening) => this.handlers.onListeningChange(listening),
        onFailure: (failure) => this.handlers.onFailure(failure),
      });
    }
    this.engine.start();
  }

  async stop(): Promise<void> {
    await this.local?.stop();
    await this.engine?.stop();
  }

  dispose(): void {
    this.disposed = true;
    this.local?.dispose();
    this.local = null;
    this.engine?.dispose();
    this.engine = null;
  }

  private retune(lang: Lang): void {
    if (lang === this.active) return;
    // The browser engine flushes while switching. That text was heard under the
    // old locale, so it keeps the old attribution and must not start another
    // language decision. The local engine decides from finished text, so it has
    // nothing to retune.
    this.switching = true;
    try {
      this.engine?.switchLocale(this.localeFor(lang));
    } finally {
      this.switching = false;
    }
    this.active = lang;
    this.handlers.onLanguageChange(lang);
  }

  private handleInterim(text: string): void {
    if (!this.autoDetect || !text.trim() || this.switching) {
      this.handlers.onInterim(text, this.active);
      return;
    }
    const decision = decideListenLanguage(this.active, text, 'interim');
    if (decision.switchNow) this.retune(decision.lang);
    this.handlers.onInterim(text, this.active);
  }

  private handleSentence(sentence: string): void {
    if (!sentence.trim()) return;

    if (this.switching) {
      this.handlers.onSentence(sentence, this.active, false);
      return;
    }

    if (!this.autoDetect) {
      this.handlers.onSentence(sentence, this.active, false);
      return;
    }

    const decision = decideListenLanguage(this.active, sentence, 'final');

    // The words are saved whatever the verdict — dropping speech the user cannot
    // reproduce would lose real work. The attribution always follows the detection,
    // so a line is never translated from the wrong language; only the recogniser is
    // retuned cautiously. A misattributed line can be flipped from the notebook.
    this.handlers.onSentence(sentence, decision.lang, true);

    if (decision.switchNow) this.retune(decision.lang);
  }
}
