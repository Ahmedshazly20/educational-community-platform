import { useNavigate } from 'react-router-dom';
import { ar } from '../../i18n/ar';
import { Button, Surface } from '../../components/ui/Primitives';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <Surface className="max-w-md text-center">
        <p className="font-mono text-4xl font-bold text-slate-300">404</p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">{ar.auth.notFoundTitle}</h1>
        <p className="mt-2 text-sm text-slate-600">{ar.auth.notFoundMessage}</p>
        <Button className="mt-5" onClick={() => navigate('/')}>
          {ar.auth.backToDashboard}
        </Button>
      </Surface>
    </div>
  );
}
