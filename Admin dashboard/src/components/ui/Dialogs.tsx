import React from 'react';
import { X } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { useUiStore } from '../../stores/uiStore';
import { Button, ModalShell } from './Primitives';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = ar.app.confirm,
  danger = false,
  loading = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <ModalShell open={open} title={title} onClose={onClose} maxWidth="max-w-md">
      <p className="text-sm leading-relaxed text-slate-700">{message}</p>
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {ar.app.cancel}
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          loading={loading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </ModalShell>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-full w-full max-w-xl flex-col border-s border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={ar.app.close}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex max-w-md flex-col gap-2"
    >
      {toasts.map((t) => {
        const tone =
          t.type === 'error'
            ? 'border-red-300 bg-red-50 text-red-900'
            : t.type === 'success'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
            : 'border-slate-300 bg-white text-slate-900';
        return (
          <div
            key={t.id}
            role="status"
            className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${tone}`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.message}</p>
              {t.code && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(t.code ?? '')}
                  className="mt-1 text-xs underline opacity-80 cursor-pointer"
                >
                  نسخ كود الخطأ: {t.code}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label={ar.app.close}
              className="rounded p-1 hover:bg-black/5 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
