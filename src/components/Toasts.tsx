import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { Toast } from '../hooks/useAppStore';

const TONE = {
  info: { Icon: Info, color: 'var(--ln-accent)' },
  success: { Icon: CheckCircle2, color: 'var(--ln-ok)' },
  warning: { Icon: AlertTriangle, color: 'var(--ln-warn)' },
  error: { Icon: XCircle, color: 'var(--ln-danger)' },
} as const;

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { Icon, color } = TONE[toast.tone];
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.animate(
      [
        { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 180, easing: 'ease-out' },
    );
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-line bg-panel p-3 shadow-lg shadow-black/5"
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-semibold leading-snug text-ink">{toast.title}</p>
        {toast.detail ? (
          <p className="mt-0.5 text-[0.75rem] leading-relaxed text-muted">{toast.detail}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-m-1 rounded p-1 text-muted transition-colors hover:text-ink"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}