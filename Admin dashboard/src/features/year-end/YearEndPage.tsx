import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, Trash2 } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api, isMockMode } from '../../data';
import { keys } from '../../data/keys';
import { yearEndRegisterSchema } from '../../data/schemas';
import { useNotify } from '../../hooks/useNotify';
import { formatCairoDateTime } from '../../lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  FieldError,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';
import { ConfirmDialog } from '../../components/ui/Dialogs';

export function YearEndPage() {
  const qc = useQueryClient();
  const notify = useNotify();

  const reportsQ = useQuery({
    queryKey: keys.yearEnd.reports,
    queryFn: () => api.getYearEndReports(),
  });

  const studentsQ = useQuery({
    queryKey: ['yearEnd', 'students'],
    queryFn: () => api.getStudents({ page: 1, pageSize: 100 }),
    enabled: !isMockMode,
  });

  const [academicYear, setAcademicYear] = React.useState('2025-2026');
  const [studentId, setStudentId] = React.useState('');
  const [pdfPath, setPdfPath] = React.useState('');
  const [regError, setRegError] = React.useState<string | undefined>();

  const [purgeYear, setPurgeYear] = React.useState('');
  const [deleteText, setDeleteText] = React.useState('');
  const [purgeConfirmOpen, setPurgeConfirmOpen] = React.useState(false);

  const registerMut = useMutation({
    mutationFn: async () => {
      if (!isMockMode && !studentId.trim()) {
        setRegError('يرجى اختيار الطالب أو إدخال معرفه (p_student)');
        throw new Error('VALIDATION');
      }
      const parsed = yearEndRegisterSchema.safeParse({
        academic_year: academicYear,
        pdf_path: pdfPath,
      });
      if (!parsed.success) {
        setRegError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة');
        throw new Error('VALIDATION');
      }
      setRegError(undefined);
      return api.registerYearEndReport(
        parsed.data.academic_year,
        parsed.data.pdf_path,
        studentId.trim() || undefined
      );
    },
    onSuccess: (rep) => {
      setPdfPath('');
      setPurgeYear(rep.academic_year);
      qc.invalidateQueries({ queryKey: keys.yearEnd.reports });
      notify.success('تم تسجيل تقرير نهاية العام بنجاح');
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'VALIDATION') return;
      notify.error(e);
    },
  });

  const purgeMut = useMutation({
    mutationFn: () => api.purgeYearEndDetails(purgeYear, deleteText),
    onSuccess: (count) => {
      setPurgeConfirmOpen(false);
      setDeleteText('');
      qc.invalidateQueries({ queryKey: keys.yearEnd.reports });
      notify.success(`تمت تصفية البيانات التفصيلية للعام (${count} سجل)`);
    },
    onError: (e) => notify.error(e),
  });

  const reports = reportsQ.data ?? [];

  React.useEffect(() => {
    if (!purgeYear && reports.length > 0) {
      const unpurged = reports.find((r) => !r.purged_at) ?? reports[0];
      if (unpurged) setPurgeYear(unpurged.academic_year);
    }
  }, [reports, purgeYear]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.yearEnd.title}
        subtitle="تسجيل التقارير السنوية وتصفية التفاصيل المؤرشفة لنهاية العام الدراسي"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-g700" />
            <h2 className="text-base font-bold text-slate-900">{ar.yearEnd.registerReport}</h2>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {ar.yearEnd.academicYear}
            </label>
            <input
              type="text"
              dir="ltr"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="2025-2026"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-left"
            />
          </div>

          {!isMockMode && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">الطالب</label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">اختر الطالب...</option>
                {(studentsQ.data?.items ?? []).map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.full_name} ({st.phone})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{ar.yearEnd.pdfPath}</label>
            <input
              type="text"
              dir="ltr"
              value={pdfPath}
              onChange={(e) => setPdfPath(e.target.value)}
              placeholder="reports/2025-2026-annual.pdf"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-left"
            />
          </div>
          <FieldError message={regError} />

          <Button loading={registerMut.isPending} onClick={() => registerMut.mutate()}>
            {ar.yearEnd.registerReport}
          </Button>
        </Surface>

        <Surface className="space-y-4 border-red-200 bg-red-50/40">
          <div className="flex items-center gap-2 text-red-900">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="text-base font-bold">{ar.yearEnd.purgeTitle}</h2>
          </div>
          <p className="text-xs leading-relaxed text-red-900">{ar.yearEnd.purgeWarning}</p>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              العام الدراسي المسجل:
            </label>
            <select
              value={purgeYear}
              onChange={(e) => setPurgeYear(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            >
              {reports.length === 0 && <option value="">لا توجد تقارير مسجلة بعد</option>}
              {reports.map((r) => (
                <option key={r.id} value={r.academic_year}>
                  {r.academic_year} {r.purged_at ? '(تمت التصفية)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {ar.yearEnd.typeDeletePlaceholder}
            </label>
            <input
              type="text"
              dir="ltr"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="DELETE"
              className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-mono text-left"
            />
          </div>

          <Button
            variant="danger"
            disabled={!purgeYear || deleteText !== 'DELETE'}
            onClick={() => setPurgeConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            تنفيذ تصفية نهاية العام
          </Button>
        </Surface>
      </div>

      <Surface>
        <h2 className="mb-4 text-base font-bold text-slate-900">سجل تقارير نهاية العام</h2>
        {reportsQ.isLoading ? (
          <SkeletonRows rows={3} />
        ) : reportsQ.error ? (
          <ErrorState error={reportsQ.error} onRetry={() => reportsQ.refetch()} />
        ) : reports.length === 0 ? (
          <EmptyState title="لا توجد تقارير نهاية عام مسجلة بعد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">العام الدراسي</th>
                  <th className="px-4 py-2.5">مسار التقرير</th>
                  <th className="px-4 py-2.5">تاريخ التسجيل</th>
                  <th className="px-4 py-2.5">حالة التصفية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-mono font-bold">{r.academic_year}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600" dir="ltr">
                      {r.pdf_path}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                      {formatCairoDateTime(r.registered_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.purged_at ? (
                        <StatusTag tone="warning" label={`تمت التصفية: ${formatCairoDateTime(r.purged_at)}`} />
                      ) : (
                        <StatusTag tone="success" label="مسجل (قبل التصفية)" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <ConfirmDialog
        open={purgeConfirmOpen}
        title={ar.yearEnd.purgeTitle}
        message={`هل أنت متأكد تمامًا من تصفية البيانات التفصيلية للعام الدراسي ${purgeYear}؟ هذا الإجراء لا يمكن التراجع عنه.`}
        confirmLabel="تأكيد التصفية النهائية"
        danger
        loading={purgeMut.isPending}
        onConfirm={() => purgeMut.mutate()}
        onClose={() => setPurgeConfirmOpen(false)}
      />
    </div>
  );
}
