import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { formatCairoDate, formatEgp } from '../../lib/format';
import { exportTableToXlsx } from '../../lib/xlsx';
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
  Surface,
} from '../../components/ui/Primitives';
import { SimpleBarChart } from '../../components/ui/SimpleCharts';

type ReportTab =
  | 'revenue'
  | 'subscriptions'
  | 'payments'
  | 'students'
  | 'coverage'
  | 'exams'
  | 'engagement';

export function ReportsPage() {
  const [tab, setTab] = React.useState<ReportTab>('revenue');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [termId, setTermId] = React.useState('');
  const [stageId, setStageId] = React.useState('');
  const [trackId, setTrackId] = React.useState('');

  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });
  const stagesQ = useQuery({ queryKey: keys.academic.stages, queryFn: () => api.getStages() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });

  const filters = {
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    termId: termId || undefined,
    stageId: stageId || undefined,
    trackId: trackId || undefined,
  };

  const bundleQ = useQuery({
    queryKey: keys.reports.data(tab, filters),
    queryFn: () => api.getReportsBundle(filters),
  });

  const bundle = bundleQ.data;
  const terms = termsQ.data ?? [];
  const stages = stagesQ.data ?? [];
  const tracks = (tracksQ.data ?? []).filter((t) => !stageId || t.stage_id === stageId);

  const revenueByTerm = React.useMemo(() => {
    if (!bundle) return [];
    const map = new Map<string, number>();
    for (const s of bundle.subscriptions) {
      if (s.status === 'cancelled') continue;
      const key = s.term_name ?? s.term_id;
      map.set(key, (map.get(key) ?? 0) + s.price_paid_egp);
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [bundle]);

  const subsByTrack = React.useMemo(() => {
    if (!bundle) return [];
    const map = new Map<string, number>();
    for (const s of bundle.subscriptions) {
      const key = s.track_name ?? s.track_id;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [bundle]);

  const paymentsByStatus = React.useMemo(() => {
    if (!bundle) return [];
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const p of bundle.payments) {
      counts[p.status] += 1;
    }
    return [
      { label: ar.payments.tabs.pending, value: counts.pending },
      { label: ar.payments.tabs.approved, value: counts.approved },
      { label: ar.payments.tabs.rejected, value: counts.rejected },
    ];
  }, [bundle]);

  const studentsByGov = React.useMemo(() => {
    if (!bundle) return [];
    const map = new Map<string, number>();
    for (const st of bundle.students) {
      map.set(st.governorate_name, (map.get(st.governorate_name) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [bundle]);

  const lessonsByCourse = React.useMemo(() => {
    if (!bundle) return [];
    const map = new Map<string, number>();
    for (const l of bundle.lessons) {
      map.set(l.course_name, (map.get(l.course_name) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
  }, [bundle]);

  const exportCurrentTab = () => {
    if (!bundle) return;
    switch (tab) {
      case 'revenue':
        exportTableToXlsx(
          'report-revenue.xlsx',
          'Revenue',
          ['الترم', 'إجمالي الإيراد (ج.م)'],
          revenueByTerm.map((r) => [r.label, r.value])
        );
        break;
      case 'subscriptions':
        exportTableToXlsx(
          'report-subscriptions.xlsx',
          'Subscriptions',
          ['الطالب', 'المسار', 'الترم', 'السعر', 'الحالة', 'الانتهاء'],
          bundle.subscriptions.map((s) => [
            s.student_name ?? s.student_id,
            s.track_name ?? s.track_id,
            s.term_name ?? s.term_id,
            s.price_paid_egp,
            ar.pricing.subscriptionStatuses[s.status],
            formatCairoDate(s.ends_at),
          ])
        );
        break;
      case 'payments':
        exportTableToXlsx(
          'report-payments.xlsx',
          'Payments',
          ['الطالب', 'المبلغ', 'الرقم المحول', 'الحالة', 'التاريخ'],
          bundle.payments.map((p) => [
            p.student_name,
            p.amount_egp,
            p.sender_phone,
            ar.payments.tabs[p.status],
            formatCairoDate(p.created_at),
          ])
        );
        break;
      case 'students':
        exportTableToXlsx(
          'report-students.xlsx',
          'Students',
          ['الاسم', 'الموبايل', 'المحافظة', 'المسار', 'الحالة'],
          bundle.students.map((st) => [
            st.full_name,
            st.phone,
            st.governorate_name,
            st.track_name,
            st.is_blocked ? 'محظور' : st.active_subscriptions_count > 0 ? 'مشترك' : 'تجربة',
          ])
        );
        break;
      case 'coverage':
        exportTableToXlsx(
          'report-coverage.xlsx',
          'Coverage',
          ['الدرس', 'المادة', 'الترم', 'الحالة', 'عدد العناصر'],
          bundle.lessons.map((l) => [
            l.title,
            l.course_name,
            l.term_name,
            ar.content.lessonStatus[l.status],
            l.items_count,
          ])
        );
        break;
      case 'exams':
        exportTableToXlsx(
          'report-exam-results.xlsx',
          'ExamResults',
          ['الطالب', 'الامتحان', 'المجموع', 'الدرجة النهائية', 'النسبة %'],
          bundle.results.map((r) => [
            r.student_name ?? r.student_id,
            r.exam_title ?? r.exam_id,
            r.total_score,
            r.max_score,
            r.percentage,
          ])
        );
        break;
      case 'engagement':
        exportTableToXlsx(
          'report-engagement.xlsx',
          'Engagement',
          ['المؤشر', 'القيمة'],
          [
            ['عناصر الدروس المكتملة', bundle.itemProgressCount],
            ['إجمالي إجابات الأسئلة السريعة', bundle.quickAnswersStats.total],
            ['الإجابات الصحيحة للأسئلة السريعة', bundle.quickAnswersStats.correct],
          ]
        );
        break;
    }
  };

  const tabsList: Array<{ key: ReportTab; label: string }> = [
    { key: 'revenue', label: ar.reports.tabs.revenue },
    { key: 'subscriptions', label: ar.reports.tabs.subscriptions },
    { key: 'payments', label: ar.reports.tabs.payments },
    { key: 'students', label: ar.reports.tabs.students },
    { key: 'coverage', label: ar.reports.tabs.coverage },
    { key: 'exams', label: ar.reports.tabs.exams },
    { key: 'engagement', label: ar.reports.tabs.engagement },
  ];

  const totalRevenue = revenueByTerm.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.reports.title}
        subtitle="تحليلات الإيرادات، الاشتراكات، المدفوعات، الطلاب، المحتوى، الامتحانات، والتفاعل"
        actions={
          <Button variant="secondary" disabled={!bundle} onClick={exportCurrentTab}>
            <FileSpreadsheet className="h-4 w-4" />
            {ar.app.exportXlsx}
          </Button>
        }
      />

      {bundle?.truncated && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950"
        >
          <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
          <span>{ar.reports.truncationWarning}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabsList.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Surface className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-xs font-medium text-slate-600">
          من تاريخ:
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          إلى تاريخ:
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          الترم:
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">كل الترمات</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name_ar}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          الصف:
          <select
            value={stageId}
            onChange={(e) => {
              setStageId(e.target.value);
              setTrackId('');
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">كل الصفوف</option>
            {stages.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name_ar}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          المسار:
          <select
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">كل المسارات</option>
            {tracks.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name_ar}
              </option>
            ))}
          </select>
        </label>
      </Surface>

      {bundleQ.isLoading ? (
        <SkeletonRows rows={6} />
      ) : bundleQ.error || !bundle ? (
        <ErrorState error={bundleQ.error} onRetry={() => bundleQ.refetch()} />
      ) : (
        <div className="space-y-6">
          {tab === 'revenue' && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Surface>
                  <p className="text-xs text-slate-500">إجمالي الإيرادات المسجلة</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-g700">
                    {formatEgp(totalRevenue)}
                  </p>
                </Surface>
                <Surface>
                  <p className="text-xs text-slate-500">عدد الاشتراكات المدفوعة/الممنوحة</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
                    {bundle.subscriptions.filter((s) => s.status !== 'cancelled').length}
                  </p>
                </Surface>
                <Surface>
                  <p className="text-xs text-slate-500">المدفوعات المقبولة</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
                    {bundle.payments.filter((p) => p.status === 'approved').length}
                  </p>
                </Surface>
              </div>
              <SimpleBarChart title="الإيرادات حسب الترم" data={revenueByTerm} unit={ar.app.currency} />
            </>
          )}

          {tab === 'subscriptions' && (
            <>
              <SimpleBarChart title="الاشتراكات حسب المسار" data={subsByTrack} unit="اشتراك" />
              <Surface>
                {bundle.subscriptions.length === 0 ? (
                  <EmptyState title="لا توجد اشتراكات مطابقة" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="border-b border-slate-200 text-xs text-slate-500">
                        <tr>
                          <th className="py-2 pl-4">الطالب</th>
                          <th className="py-2 pl-4">المسار / الترم</th>
                          <th className="py-2 pl-4">المبلغ</th>
                          <th className="py-2">الانتهاء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bundle.subscriptions.map((s) => (
                          <tr key={s.id}>
                            <td className="py-2.5 pl-4 font-medium">{s.student_name ?? s.student_id}</td>
                            <td className="py-2.5 pl-4 text-xs text-slate-600">
                              {s.track_name} · {s.term_name}
                            </td>
                            <td className="py-2.5 pl-4 font-mono tabular-nums">{formatEgp(s.price_paid_egp)}</td>
                            <td className="py-2.5 font-mono text-xs tabular-nums">{formatCairoDate(s.ends_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Surface>
            </>
          )}

          {tab === 'payments' && (
            <>
              <SimpleBarChart title="توزيع حالات طلبات الدفع" data={paymentsByStatus} unit="طلب" />
              <Surface>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="py-2 pl-4">الطالب</th>
                        <th className="py-2 pl-4">المبلغ</th>
                        <th className="py-2 pl-4">الحالة</th>
                        <th className="py-2">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bundle.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 pl-4 font-medium">{p.student_name}</td>
                          <td className="py-2.5 pl-4 font-mono tabular-nums">{formatEgp(p.amount_egp)}</td>
                          <td className="py-2.5 pl-4 text-xs">{ar.payments.tabs[p.status]}</td>
                          <td className="py-2.5 font-mono text-xs tabular-nums">{formatCairoDate(p.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Surface>
            </>
          )}

          {tab === 'students' && (
            <>
              <SimpleBarChart title="الطلاب حسب المحافظة" data={studentsByGov} unit="طالب" />
              <Surface>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="py-2 pl-4">الاسم</th>
                        <th className="py-2 pl-4">الموبايل</th>
                        <th className="py-2 pl-4">المحافظة</th>
                        <th className="py-2">المسار</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bundle.students.map((st) => (
                        <tr key={st.id}>
                          <td className="py-2.5 pl-4 font-medium">{st.full_name}</td>
                          <td className="py-2.5 pl-4 font-mono text-xs tabular-nums">{st.phone}</td>
                          <td className="py-2.5 pl-4 text-xs">{st.governorate_name}</td>
                          <td className="py-2.5 text-xs">{st.track_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Surface>
            </>
          )}

          {tab === 'coverage' && (
            <SimpleBarChart title="عدد الدروس حسب المادة" data={lessonsByCourse} unit="درس" />
          )}

          {tab === 'exams' && (
            <Surface>
              <h3 className="mb-3 text-base font-bold text-slate-900">نتائج الامتحانات المعتمدة</h3>
              {bundle.results.length === 0 ? (
                <EmptyState title="لا توجد نتائج معتمدة ضمن الفلتر الحالي" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="border-b border-slate-200 text-xs text-slate-500">
                      <tr>
                        <th className="py-2 pl-4">الطالب</th>
                        <th className="py-2 pl-4">الدرجة</th>
                        <th className="py-2">النسبة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bundle.results.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 pl-4 font-medium">{r.student_name ?? r.student_id}</td>
                          <td className="py-2.5 pl-4 font-mono tabular-nums">
                            {r.total_score} / {r.max_score}
                          </td>
                          <td className="py-2.5 font-mono tabular-nums font-bold text-g700">
                            {r.percentage}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Surface>
          )}

          {tab === 'engagement' && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Surface>
                <p className="text-xs text-slate-500">إجمالي العناصر المكتملة</p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-g700">
                  {bundle.itemProgressCount}
                </p>
              </Surface>
              <Surface>
                <p className="text-xs text-slate-500">إجمالي محاولات الأسئلة السريعة</p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
                  {bundle.quickAnswersStats.total}
                </p>
              </Surface>
              <Surface>
                <p className="text-xs text-slate-500">نسبة الدقة في الأسئلة السريعة</p>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">
                  {bundle.quickAnswersStats.total > 0
                    ? Math.round(
                        (bundle.quickAnswersStats.correct / bundle.quickAnswersStats.total) * 100
                      )
                    : 0}
                  %
                </p>
              </Surface>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
