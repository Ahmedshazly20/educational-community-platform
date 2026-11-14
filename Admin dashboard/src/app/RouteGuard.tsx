import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { canAccessPath } from '../lib/permissions';
import { useAuthStore } from '../stores/authStore';

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const initialized = useAuthStore((s) => s.initialized);
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        جارٍ التحقق من الجلسة...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (session.roles.length === 0) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (session.mfaRequired && !session.mfaVerified) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessPath(session.roles, location.pathname)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
