import React from 'react';
import { Check, Copy, QrCode, RefreshCw } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api, isMockMode } from '../../data';
import type { AuthSessionState, MfaEnrollmentData } from '../../data/client';
import { getErrorMessage } from '../../lib/errors';
import { Button, FieldError } from '../../components/ui/Primitives';

interface TotpEnrollPanelProps {
  onSuccess: (updatedSession: AuthSessionState) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

export function TotpEnrollPanel({
  onSuccess,
  onCancel,
  cancelLabel = ar.app.cancel,
}: TotpEnrollPanelProps) {
  const [enrollment, setEnrollment] = React.useState<MfaEnrollmentData | null>(null);
  const [enrolling, setEnrolling] = React.useState(true);
  const [enrollError, setEnrollError] = React.useState<string | null>(null);

  const [code, setCode] = React.useState('');
  const [verifying, setVerifying] = React.useState(false);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const startEnroll = React.useCallback(async () => {
    setEnrolling(true);
    setEnrollError(null);
    setVerifyError(null);
    try {
      const data = await api.enrollMfa();
      setEnrollment(data);
    } catch (err) {
      setEnrollment(null);
      setEnrollError(getErrorMessage(err));
    } finally {
      setEnrolling(false);
    }
  }, []);

  React.useEffect(() => {
    void startEnroll();
  }, [startEnroll]);

  const handleCopySecret = async () => {
    if (!enrollment?.secret) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    setVerifyError(null);
    setVerifying(true);
    try {
      const updated = await api.verifyMfa(code, enrollment.factorId);
      onSuccess(updated);
    } catch (err) {
      setVerifyError(getErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  if (enrolling) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-g700 border-t-transparent" />
        <p className="text-sm text-slate-600">{ar.auth.mfaLoadingQr}</p>
      </div>
    );
  }

  if (enrollError || !enrollment) {
    return (
      <div className="space-y-4">
        {enrollError && <FieldError message={enrollError} />}
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
              {cancelLabel}
            </Button>
          )}
          <Button type="button" onClick={() => void startEnroll()} className="flex-1">
            <RefreshCw className="h-4 w-4" />
            {ar.auth.mfaRetryEnroll}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-g700">
        <QrCode className="h-5 w-5" />
        <h2 className="text-base font-bold">{ar.auth.mfaEnrollTitle}</h2>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">{ar.auth.mfaEnrollSubtitle}</p>

      {isMockMode && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {ar.auth.mfaHintMock}
        </p>
      )}

      <div className="flex justify-center">
        <img
          src={enrollment.qrCode}
          alt="QR Code لتفعيل التحقق الثنائي"
          className="h-44 w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-600">{ar.auth.mfaSecretLabel}</span>
          <button
            type="button"
            onClick={() => void handleCopySecret()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? ar.auth.mfaCopiedSecret : ar.auth.mfaCopySecret}
          </button>
        </div>
        <p
          dir="ltr"
          className="break-all rounded border border-slate-200 bg-white px-2.5 py-1.5 text-center font-mono text-xs text-slate-800 select-all"
        >
          {enrollment.secret}
        </p>
      </div>

      <div>
        <label htmlFor="mfa-enroll-code" className="mb-1 block text-sm font-medium text-slate-700">
          {ar.auth.mfaCode}
        </label>
        <input
          id="mfa-enroll-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-base tracking-widest focus:border-g700 focus:outline-none"
          dir="ltr"
        />
      </div>

      {verifyError && <FieldError message={verifyError} />}

      <div className="flex items-center gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
            {cancelLabel}
          </Button>
        )}
        <Button type="submit" loading={verifying} className="flex-1">
          {ar.auth.mfaEnrollSubmit}
        </Button>
      </div>
    </form>
  );
}
