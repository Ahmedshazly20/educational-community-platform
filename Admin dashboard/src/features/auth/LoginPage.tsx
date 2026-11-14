import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api, isMockMode } from '../../data';
import { getErrorMessage } from '../../lib/errors';
import { useAuthStore } from '../../stores/authStore';
import { queryClient } from '../../app/AppProviders';
import { Button, FieldError, Surface } from '../../components/ui/Primitives';

const MOCK_ACCOUNTS = [
  { email: 'admin@thanawya.edu.eg', label: 'مدير عام (يتطلب MFA)' },
  { email: 'content@thanawya.edu.eg', label: 'مدير المحتوى' },
  { email: 'pay@thanawya.edu.eg', label: 'مراجع المدفوعات (يتطلب MFA)' },
  { email: 'exams@thanawya.edu.eg', label: 'مدير الامتحانات' },
  { email: 'grader@thanawya.edu.eg', label: 'مصحح' },
  { email: 'mgr@thanawya.edu.eg', label: 'مدير الطلاب' },
  { email: 'support@thanawya.edu.eg', label: 'الدعم الفني' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [mfaCode, setMfaCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const needsMfaStep = Boolean(session && session.mfaRequired && !session.mfaVerified);

  React.useEffect(() => {
    if (session && session.roles.length > 0 && (!session.mfaRequired || session.mfaVerified)) {
      navigate('/', { replace: true });
    } else if (session && session.roles.length === 0) {
      navigate('/unauthorized', { replace: true });
    }
  }, [navigate, session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      queryClient.clear();
      const sess = await api.signIn(email, password);
      setSession(sess);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const updated = await api.verifyMfa(mfaCode);
      setSession(updated);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (demoEmail: string) => {
    setErrorMsg(null);
    setEmail(demoEmail);
    setPassword('demo123456');
    setLoading(true);
    try {
      queryClient.clear();
      const sess = await api.signIn(demoEmail, 'demo123456');
      setSession(sess);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-g700 text-xl font-bold text-white">
            ث
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{ar.app.name}</h1>
          <p className="mt-1 text-sm text-slate-600">{ar.auth.loginTitle}</p>
        </div>

        <Surface>
          {!needsMfaStep ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-xs text-slate-500">{ar.auth.loginSubtitle}</p>
              <div>
                <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">
                  {ar.auth.email}
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-g700 focus:outline-none"
                  dir="ltr"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">
                  {ar.auth.password}
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-g700 focus:outline-none"
                  dir="ltr"
                />
              </div>
              {errorMsg && <FieldError message={errorMsg} />}
              <Button type="submit" loading={loading} className="w-full">
                {ar.auth.signIn}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleMfa} className="space-y-4">
              <div className="flex items-center gap-2 text-g700">
                <ShieldCheck className="h-5 w-5" />
                <h2 className="text-base font-bold">{ar.auth.mfaTitle}</h2>
              </div>
              <p className="text-xs text-slate-600">{ar.auth.mfaSubtitle}</p>
              {isMockMode && (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  {ar.auth.mfaHintMock}
                </p>
              )}
              <div>
                <label htmlFor="mfa-code" className="mb-1 block text-sm font-medium text-slate-700">
                  {ar.auth.mfaCode}
                </label>
                <input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-base tracking-widest focus:border-g700 focus:outline-none"
                  dir="ltr"
                />
              </div>
              {errorMsg && <FieldError message={errorMsg} />}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => api.signOut().then(() => setSession(null))}
                  className="flex-1"
                >
                  {ar.app.cancel}
                </Button>
                <Button type="submit" loading={loading} className="flex-1">
                  {ar.auth.mfaVerify}
                </Button>
              </div>
            </form>
          )}
        </Surface>

        {isMockMode && !needsMfaStep && (
          <Surface className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-600">{ar.auth.demoAccountsTitle}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MOCK_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickDemo(acc.email)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-medium text-slate-700 transition-colors hover:border-g700 hover:bg-g50 hover:text-g800 cursor-pointer"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}
