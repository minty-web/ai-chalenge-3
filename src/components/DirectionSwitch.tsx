import type { Direction } from '../types';
import { DIRECTIONS } from '../types';

interface Props {
  value: Direction;
  onChange: (direction: Direction) => void;
  disabled?: boolean;
}

export function DirectionSwitch({ value, onChange, disabled }: Props) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl border border-line bg-panel p-1"
      role="radiogroup"
      aria-label="Translation direction"
    >
      {(Object.keys(DIRECTIONS) as Direction[]).map((dir) => {
        const active = dir === value;
        const info = DIRECTIONS[dir];
        return (
          <button
            key={dir}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(dir)}
            className="relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={
              active
                ? {
                    backgroundColor: 'var(--ln-accent)',
                    color: 'var(--ln-accent-ink)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.14)',
                  }
                : { color: 'var(--ln-muted)' }
            }
          >
            <span aria-hidden className="text-[0.875rem] leading-none">
              {info.flag}
            </span>
            <span className="hidden sm:inline">
              {dir === 'fi-en' ? 'Finnish → English' : 'English → Finnish'}
            </span>
            <span className="sm:hidden">{dir === 'fi-en' ? 'FI → EN' : 'EN → FI'}</span>
            {active ? <span className="sr-only">(selected)</span> : null}
          </button>
        );
      })}
    </div>
  );
}