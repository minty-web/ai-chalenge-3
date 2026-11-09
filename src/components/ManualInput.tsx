import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Loader2, Send } from 'lucide-react';
import type { Lang } from '../types';
import { LANG_NAME } from '../types';

interface Props {
  sourceLang: Lang;
  targetLang: Lang;
  onSubmit: (text: string) => Promise<void> | void;
  busy: boolean;
  disabled: boolean;
}

export function ManualInput({ sourceLang, targetLang, onSubmit, busy, disabled }: Props) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typingElsewhere =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable) &&
        target !== ref.current;
      if (typingElsewhere) return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        ref.current?.focus();
      }
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
    <div className="border-t border-line bg-panel px-3 py-2.5 sm:px-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="manual-input" className="sr-only">
              Type a sentence in {LANG_NAME[sourceLang]}
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
              placeholder={`Type in ${LANG_NAME[sourceLang]} — translated to ${LANG_NAME[targetLang]}  ( / to focus )`}
              disabled={disabled}
              className="ln-input max-h-32 min-h-[2.375rem] resize-none py-2 leading-relaxed"
              style={{ height: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
              aria-describedby="manual-hint"
            />
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!value.trim() || busy || disabled}
            className="ln-btn ln-btn-primary h-[2.375rem] shrink-0 px-3.5 text-[0.8125rem] font-semibold"
            title="Add sentence and translate (Enter)"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} aria-hidden />}
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
        <p id="manual-hint" className="mt-1.5 flex items-center gap-1.5 text-[0.6875rem] text-muted">
          <CornerDownLeft size={9} aria-hidden />
          Enter to add · Shift+Enter for a new line · works even without a microphone
        </p>
      </div>
    </div>
  );
}