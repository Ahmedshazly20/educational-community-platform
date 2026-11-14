import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckSquare,
  CreditCard,
  FileSpreadsheet,
  GraduationCap,
  History,
  LayoutDashboard,
  Layers,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { ar } from '../i18n/ar';
import { getVisibleNavItems, type NavModuleId } from '../lib/permissions';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { queryClient } from './AppProviders';
import { Button, ModalShell } from '../components/ui/Primitives';
import { TotpEnrollPanel } from '../features/auth/TotpEnrollPanel';

const NAV_ICONS: Record<NavModuleId, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  content: <BookOpen className="h-4 w-4" />,
  academic: <Layers className="h-4 w-4" />,
  students: <GraduationCap className="h-4 w-4" />,
  pricing: <Receipt className="h-4 w-4" />,
  subscriptions: <CreditCard className="h-4 w-4" />,
  payments: <CheckSquare className="h-4 w-4" />,
  exams: <FileSpreadsheet className="h-4 w-4" />,
  grading: <Award className="h-4 w-4" />,
  results: <BarChart3 className="h-4 w-4" />,
  announcements: <Megaphone className="h-4 w-4" />,
  reports: <BarChart3 className="h-4 w-4" />,
  staff: <Users className="h-4 w-4" />,
  audit: <History className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
  yearEnd: <CalendarClock className="h-4 w-4" />,
};

const IDLE_WARN_MS = 28 * 60 * 1000;
const IDLE_LOGOUT_MS = 30 * 60 * 1000;

export function AppLayout() {
  const session = useAuthStore((s) => s.session);
  const lastActivityAt = useAuthStore((s) => s.lastActivityAt);
  const idleWarningVisible = useAuthStore((s) => s.idleWarningVisible);
  const touchActivity = useAuthStore((s) => s.touchActivity);
  const setIdleWarningVisible = useAuthStore((s) => s.setIdleWarningVisible);
  const signOut = useAuthStore((s) => s.signOut);
  const setSession = useAuthStore((s) => s.setSession);

  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const [mfaModalOpen, setMfaModalOpen] = React.useState(false);

  const handleLogout = React.useCallback(async () => {
    queryClient.clear();
    await signOut();
    navigate('/login', { replace: true });
  }, [navigate, signOut]);

  React.useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const onActivity = () => touchActivity();
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    return () => events.forEach((ev) => window.removeEventListener(ev, onActivity));
  }, [touchActivity]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityAt;
      if (elapsed >= IDLE_LOGOUT_MS) {
        void handleLogout();
      } else if (elapsed >= IDLE_WARN_MS && !idleWarningVisible) {
        setIdleWarningVisible(true);
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [handleLogout, idleWarningVisible, lastActivityAt, setIdleWarningVisible]);

  const navItems = session ? getVisibleNavItems(session.roles) : [];
  const roleLabels = (session?.roles ?? []).map((r) => ar.roles[r]).join(' · ');

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {sidebarOpen && (
        <div
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
        />
      )}
      {/* Sidebar */}
      <aside
        aria-label="القائمة الجانبية"
        className={`${
          sidebarOpen ? 'w-64 translate-x-0' : 'hidden lg:flex lg:w-64'
        } fixed inset-y-0 right-0 z-40 flex flex-col border-l border-slate-200 bg-white lg:static`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-g700 text-white font-bold">
              ث
            </div>
            <span className="text-base font-bold text-slate-900 whitespace-nowrap">{ar.app.name}</span>
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={ar.app.close}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-g50 text-g700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {NAV_ICONS[item.id]}
              <span>{ar.nav[item.id]}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              {session?.profile?.full_name ?? session?.email}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{roleLabels}</p>
            {session && !session.mfaEnrolled && (
              <button
                type="button"
                onClick={() => setMfaModalOpen(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-g700 hover:text-g800 hover:underline cursor-pointer"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {ar.auth.mfaOptionalEnable}
              </button>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-center"
          >
            <LogOut className="h-4 w-4" />
            {ar.nav.logout}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="تبديل القائمة"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-slate-600">{ar.app.subtitle}</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-600">
            {session?.mfaEnrolled && (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <ShieldCheck className="h-4 w-4" />
                {ar.auth.mfaEnabledBadge}
              </span>
            )}
            <span className="hidden sm:inline">{session?.email}</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>

      <ModalShell
        open={idleWarningVisible}
        title={ar.app.idleWarningTitle}
        onClose={() => touchActivity()}
        maxWidth="max-w-md"
      >
        <p className="text-sm text-slate-700">{ar.app.idleWarningMessage}</p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={handleLogout}>
            {ar.app.signOutNow}
          </Button>
          <Button onClick={() => touchActivity()}>{ar.app.staySignedIn}</Button>
        </div>
      </ModalShell>

      <ModalShell
        open={mfaModalOpen}
        title={ar.auth.mfaOptionalModalTitle}
        onClose={() => setMfaModalOpen(false)}
        maxWidth="max-w-md"
      >
        <p className="mb-4 text-xs text-slate-600">{ar.auth.mfaOptionalModalDesc}</p>
        <TotpEnrollPanel
          onSuccess={(updated) => {
            setSession(updated);
            setMfaModalOpen(false);
          }}
          onCancel={() => setMfaModalOpen(false)}
        />
      </ModalShell>
    </div>
  );
}
