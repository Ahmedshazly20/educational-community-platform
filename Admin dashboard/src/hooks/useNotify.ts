import { useCallback } from 'react';
import { AppError, getErrorMessage, normalizeError } from '../lib/errors';
import { useUiStore } from '../stores/uiStore';

export function useNotify() {
  const pushToast = useUiStore((s) => s.pushToast);

  const success = useCallback(
    (message: string) => {
      pushToast({ type: 'success', message });
    },
    [pushToast]
  );

  const info = useCallback(
    (message: string) => {
      pushToast({ type: 'info', message });
    },
    [pushToast]
  );

  const error = useCallback(
    (err: unknown) => {
      const normalized = normalizeError(err);
      const message = getErrorMessage(normalized);
      pushToast({
        type: 'error',
        message,
        code: normalized instanceof AppError ? normalized.code : undefined,
      });
    },
    [pushToast]
  );

  return { success, info, error };
}
