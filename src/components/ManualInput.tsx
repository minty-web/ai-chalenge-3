import { useEffect, useRef, useState } from 'react';
import { ArrowUp, CornerDownLeft, Loader2 } from 'lucide-react';

/**
 * Typed input — the same path into the notebook as speech.
 *
 * It matters for two reasons: browsers without the Web Speech API (Firefox,
 * most Linux builds) can still use the whole app, and a misheard sentence can be
 * corrected by hand. The language is detected from the text, exactly like audio.
 */
export function ManualInput({
  onSubmit,
  busy,
  disabled,
}: {
  onSubmit: (text: string) => Promise<void> | void;
  busy: boolean;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
        target !== ref.current;
      if (typing) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submit = async () => {
    const text = value.trim();
    if (!text || busy || disabled) return;
    setValue('');
    await onSubmit(text);
    ref.current?.focus();
  };

  return (
    <div className="mt-3">
      <div className="flex items-end gap-2">
        <label htmlFor="manual-input" className="sr-only">
          Type a sentence in Finnish or English
        </label>
        <textarea
          id="manual-input"
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder="Type a sentence in Finnish or English…"
          disabled={disabled}
          className="ln-input max-h-32 min-h-[2.5rem] resize-none py-2.5 leading-relaxed"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
          }}
          aria-describedby="manual-hint"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!value.trim() || busy || disabled}
          className="ln-btn ln-btn-primary h-10 w-10 shrink-0 rounded-full p-0"
          title="Add this line and translate it (Enter)"
          aria-label="Add line"
        >
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ArrowUp size={15} aria-hidden />}
        </button>
      </div>
      <p
        id="manual-hint"
        className="mt-1.5 text-[0.6875rem] leading-relaxed"
        style={{ color: 'var(--ln-faint)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <CornerDownLeft size={9} aria-hidden />
          <span>Enter to add</span>
        </span>
        <span className="max-sm:hidden"> · Shift+Enter for a new line</span>
        <span className="max-sm:hidden">
          {' · '}
          <kbd className="font-sans">/</kbd> to focus · typing works without a microphone
        </span>
      </p>
    </div>
  );
}
