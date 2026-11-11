import { ArrowLeftRight, Repeat } from 'lucide-react';
import { DIRECTIONS, LANG_CODE, otherLang, type Direction, type Lang } from '../types';

/**
 * `FI (⇄) EN` — the direction control.
 *
 * Left is the language being listened for, right is what it is translated into.
 * In auto mode the left side follows the recogniser as detection moves between
 * languages, so the pair is always truthful; clicking either side pins that
 * language for a one-way conversation, and the "auto" mark is the way back.
 */
export function DirectionPill({
  direction,
  liveLang,
  onSwap,
  onPin,
  onAuto,
  disabled,
  stretch,
}: {
  direction: Direction;
  liveLang: Lang;
  onSwap: () => void;
  onPin: (lang: Lang) => void;
  onAuto: () => void;
  disabled?: boolean;
  stretch?: boolean;
}) {
  const auto = direction === 'auto';
  const source = DIRECTIONS[direction].source ?? liveLang;
  const target = DIRECTIONS[direction].target ?? otherLang(source);
  const name = (lang: Lang) => (lang === 'fi' ? 'Finnish' : 'English');

  const side = (lang: Lang) => (
    <button
      type="button"
      onClick={() => onPin(lang)}
      disabled={disabled || (!auto && lang === source)}
      aria-label={auto ? `Listen only in ${name(lang)}` : `${name(lang)} is pinned`}
      title={auto ? `Pin ${name(lang)}` : `Pinned to ${name(lang)}`}
      className="ln-display rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold leading-none transition-opacity hover:opacity-70 disabled:cursor-default disabled:opacity-100"
      style={{
        color: lang === 'fi' ? 'var(--ln-fi)' : 'var(--ln-en)',
        ...(stretch ? { flex: 1, textAlign: 'center' as const } : null),
      }}
    >
      {LANG_CODE[lang]}
    </button>
  );

  return (
    <div className={stretch ? 'flex w-full items-center gap-2' : 'flex items-center gap-2'}>
      <div
        className="ln-pillbar"
        role="group"
        aria-label={`${name(source)} to ${name(target)}${auto ? ', detecting both languages' : ''}`}
        style={stretch ? { display: 'flex', flex: 1, minWidth: 0 } : undefined}
      >
        {side(source)}
        <button
          type="button"
          onClick={onSwap}
          disabled={disabled}
          aria-label={auto ? 'Start listening in the other language' : 'Swap the translation direction'}
          title={auto ? 'Start listening in the other language' : 'Swap direction'}
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border border-line bg-bg text-ink transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {auto ? <Repeat size={13} aria-hidden /> : <ArrowLeftRight size={13} aria-hidden />}
        </button>
        {side(target)}
      </div>

      {auto ? (
        <span
          className={
            stretch
              ? 'sr-only'
              : 'ln-display hidden shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] sm:inline'
          }
          style={{ color: 'var(--ln-dim)' }}
          title="Each sentence is detected and translated into the other language"
        >
          auto
        </span>
      ) : (
        <button
          type="button"
          onClick={onAuto}
          disabled={disabled}
          className={
            stretch
              ? 'ln-display shrink-0 rounded-full border border-line px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.04em] transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60'
              : 'ln-display shrink-0 rounded-full border border-line px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-60'
          }
          style={{ color: 'var(--ln-dim)' }}
          title="Detect both languages again"
        >
          auto
        </button>
      )}
    </div>
  );
}
