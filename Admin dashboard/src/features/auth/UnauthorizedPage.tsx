import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { useAuthStore } from '../../stores/authStore';
import { queryClient } from '../../app/AppProviders';
import { Button, Surface } from '../../components/ui/Primitives';

export function UnauthorizedPage() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const hasAnyRole = (session?.roles.length ?? 0) > 0;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <Surface className="max-w-md text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-red-600" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{ar.auth.unauthorizedTitle}</h1>
        <p className="mt-2 text-sm text-slate-600">{ar.auth.unauthorizedMessage}</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          {hasAnyRole && (
            <Button onClick={() => navigate('/')}>{ar.auth.backToDashboard}</Button>
          )}
          <Button
            variant="secondary"
            onClick={async () => {
              queryClient.clear();
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            {ar.nav.logout}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
