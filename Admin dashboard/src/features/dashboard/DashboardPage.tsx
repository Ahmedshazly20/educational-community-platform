import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { hasPermission } from '../../lib/permissions';
import { formatCairoDateTime, formatNumberLatin } from '../../lib/format';
import { useAuthStore } from '../../stores/authStore';
import { ErrorState, PageHeader, SkeletonRows, Surface } from '../../components/ui/Primitives';

function KpiCard({
  label,
  value,
  sub,
  to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  to?: string;
}) {
  const body = (
    <div className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 tabular-nums">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function DashboardPage() {
  const roles = useAuthStore((s) => s.session?.roles ?? []);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.dashboard.summary,
    queryFn: () => api.getDashboardSummary(),
  });

  if (isLoading) {
    return (
      <div>
        <PageHeader title={ar.dashboard.title} />
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title={ar.dashboard.title} />
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const canSeePayments = hasPermission(roles, 'payments:read');
  const canSeeStudents = hasPermission(roles, 'students:read');
  const canSeeContent = hasPermission(roles, 'content:read');
  const canSeeExams = hasPermission(roles, 'exams:read');
  const canSeeGrading = hasPermission(roles, 'grading:read_batches') || hasPermission(roles, 'grading:approve');
  const canSeeAudit = hasPermission(roles, 'audit:read');
  const canSeeSettings = hasPermission(roles, 'settings:manage');

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.dashboard.title}
        subtitle={`مرحبًا بك — الصلاحيات النشطة: ${roles.map((r) => ar.roles[r]).join(' · ')}`}
      />

      {data.termsMissingAccessEnd.length > 0 && (canSeeSettings || canSeePayments) && (
        <div
          role="alert"
          className="flex flex-col justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold">{ar.dashboard.missingTermEndBanner}</p>
              <p className="mt-1 text-xs text-red-800">
                الترمات المتأثرة: {data.termsMissingAccessEnd.map((t) => t.name_ar).join(' · ')}
              </p>
            </div>
          </div>
          {canSeeSettings && (
            <Link
              to="/settings"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 whitespace-nowrap"
            >
              {ar.dashboard.goToSettings}
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {canSeePayments && (
          <KpiCard
            label={ar.dashboard.cards.pendingPayments}
            value={formatNumberLatin(data.pendingPaymentsCount)}
            sub={
              data.oldestPendingDays !== null
                ? ar.dashboard.cards.oldestPendingDays.replace('{days}', String(data.oldestPendingDays))
                : undefined
            }
            to={hasPermission(roles, 'payments:review') ? '/payments' : undefined}
          />
        )}

        {canSeeStudents && (
          <>
            <KpiCard
              label={ar.dashboard.cards.studentsInTrial}
              value={formatNumberLatin(data.studentsInTrialCount)}
              sub={ar.dashboard.cards.trialsEndingSoon.replace('{count}', String(data.trialsEnding7DaysCount))}
              to="/students"
            />
            <KpiCard
              label={ar.dashboard.cards.blockedStudents}
              value={formatNumberLatin(data.blockedStudentsCount)}
              to="/students"
            />
          </>
        )}

        {canSeeContent && (
          <KpiCard
            label={ar.dashboard.cards.lessonsPublishedVsDraft}
            value={`${formatNumberLatin(data.lessonsPublishedCount)} / ${formatNumberLatin(data.lessonsDraftCount)}`}
            to="/content"
          />
        )}

        {canSeeExams && (
          <>
            <KpiCard
              label={ar.dashboard.cards.upcomingSessions}
              value={formatNumberLatin(data.upcomingSessions24hCount)}
              to="/exams"
            />
            <KpiCard
              label={ar.dashboard.cards.attemptsInProgress}
              value={formatNumberLatin(data.attemptsInProgressCount)}
              to="/exams"
            />
          </>
        )}

        {canSeeGrading && (
          <KpiCard
            label={ar.dashboard.cards.examsAwaitingGrading}
            value={formatNumberLatin(data.examsAwaitingGradingCount)}
            to="/grading"
          />
        )}
      </div>

      {hasPermission(roles, 'subscriptions:read') && (
        <Surface>
          <h2 className="mb-3 text-base font-bold text-slate-900">{ar.dashboard.subscriptionsByTerm}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.activeSubscriptionsByTerm.map((row) => (
              <div
                key={row.term_id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-700">{row.term_name}</span>
                <span className="font-mono text-lg font-bold tabular-nums text-g700">
                  {formatNumberLatin(row.count)}
                </span>
              </div>
            ))}
          </div>
        </Surface>
      )}

      {canSeeAudit && (
        <Surface>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">{ar.dashboard.recentAudit}</h2>
            <Link to="/audit" className="text-xs font-semibold text-g700 hover:underline">
              عرض السجل الكامل
            </Link>
          </div>
          {data.recentAudit.length === 0 ? (
            <p className="text-sm text-slate-500">{ar.app.noData}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pl-4">الوقت</th>
                    <th className="py-2 pl-4">المنفّذ</th>
                    <th className="py-2 pl-4">الإجراء</th>
                    <th className="py-2">الكيان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentAudit.map((ev) => (
                    <tr key={ev.id}>
                      <td className="py-2.5 pl-4 font-mono tabular-nums text-slate-600">
                        {formatCairoDateTime(ev.created_at)}
                      </td>
                      <td className="py-2.5 pl-4 font-medium text-slate-800">{ev.actor_name}</td>
                      <td className="py-2.5 pl-4 font-mono text-slate-700">{ev.action}</td>
                      <td className="py-2.5 text-slate-600">
                        {ev.entity_type} · {ev.entity_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
