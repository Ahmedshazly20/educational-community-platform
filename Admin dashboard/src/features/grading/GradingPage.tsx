import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Edit3, FileSpreadsheet, Upload } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { EssayAnswerAdminRow, GradeImportRow, ImportErrorDetail } from '../../data/types';
import { adjustEssayGradeSchema } from '../../data/schemas';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../lib/permissions';
import { useNotify } from '../../hooks/useNotify';
import { formatCairoDateTime, parseDecimalInput } from '../../lib/format';
import { AppError } from '../../lib/errors';
import {
  buildGradingExportWorkbook,
  downloadUint8ArrayAsFile,
  parseGradesImportBuffer,
} from '../../lib/xlsx';
import {
  Button,
  EmptyState,
  ErrorState,
  FieldError,
  ModalShell,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';
import { ConfirmDialog } from '../../components/ui/Dialogs';

export function GradingPage() {
  const qc = useQueryClient();
  const notify = useNotify();
  const roles = useAuthStore((s) => s.session?.roles ?? []);

  const canExportImport = hasPermission(roles, 'grading:export_import');
  const canApprove = hasPermission(roles, 'grading:approve');
  const canReadEssayAdmin = hasPermission(roles, 'grading:read_essay_grades');
  const canAdjustEssay = hasPermission(roles, 'grading:adjust_essay');

  const examsQ = useQuery({
    queryKey: keys.exams.list({ status: 'published' }),
    queryFn: () => api.getExams({ status: 'published' }),
  });

  const exams = examsQ.data ?? [];
  const [selectedExamId, setSelectedExamId] = React.useState('');

  React.useEffect(() => {
    if (!selectedExamId && exams.length > 0) {
      // Prefer exam-2 in seed if present, otherwise first exam
      const preferred = exams.find((e) => e.id === 'exam-2') ?? exams[0];
      if (preferred) setSelectedExamId(preferred.id);
    }
  }, [exams, selectedExamId]);

  const [activeTab, setActiveTab] = React.useState<'batches' | 'essay'>('batches');

  const batchesQ = useQuery({
    queryKey: keys.grading.batches(selectedExamId),
    queryFn: () => api.getGradingBatches(selectedExamId),
    enabled: Boolean(selectedExamId),
  });

  const detailQ = useQuery({
    queryKey: keys.exams.detail(selectedExamId),
    queryFn: () => api.getExamDetail(selectedExamId),
    enabled: Boolean(selectedExamId),
  });

  const essayQ = useQuery({
    queryKey: keys.grading.essayAnswers(selectedExamId),
    queryFn: () => api.listEssayAnswersAdmin(selectedExamId),
    enabled: Boolean(selectedExamId) && canReadEssayAdmin && activeTab === 'essay',
  });

  // Import state
  const [selectedBatchId, setSelectedBatchId] = React.useState('');
  const [parsedRows, setParsedRows] = React.useState<GradeImportRow[]>([]);
  const [importErrors, setImportErrors] = React.useState<ImportErrorDetail[]>([]);
  const [aiGraded, setAiGraded] = React.useState(false);
  const [importFileName, setImportFileName] = React.useState('');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [approveConfirmOpen, setApproveConfirmOpen] = React.useState(false);

  // Essay adjust modal
  const [adjustTarget, setAdjustTarget] = React.useState<EssayAnswerAdminRow | null>(null);
  const [adjustScore, setAdjustScore] = React.useState('');
  const [adjustReason, setAdjustReason] = React.useState('');
  const [adjustFieldErr, setAdjustFieldErr] = React.useState<string | undefined>();

  React.useEffect(() => {
    const batches = batchesQ.data ?? [];
    if (batches.length > 0 && !batches.some((b) => b.id === selectedBatchId)) {
      const pending = batches.find((b) => !b.imported_at) ?? batches[0];
      if (pending) setSelectedBatchId(pending.id);
    }
  }, [batchesQ.data, selectedBatchId]);

  const exportMut = useMutation({
    mutationFn: async () => {
      const { batch, rows } = await api.exportGrading(selectedExamId);
      const bytes = buildGradingExportWorkbook(rows);
      downloadUint8ArrayAsFile(bytes, `grading-${selectedExamId}-${batch.id}.xlsx`);
      return { batch, count: rows.length };
    },
    onSuccess: ({ batch, count }) => {
      setSelectedBatchId(batch.id);
      qc.invalidateQueries({ queryKey: keys.grading.batches(selectedExamId) });
      notify.success(`تم تصدير شيت التصحيح المجهول (${count} إجابة)`);
    },
    onError: (e) => notify.error(e),
  });

  const importMut = useMutation({
    mutationFn: () => api.importGrades(selectedBatchId, parsedRows, aiGraded),
    onSuccess: () => {
      setParsedRows([]);
      setImportErrors([]);
      setImportFileName('');
      qc.invalidateQueries({ queryKey: keys.grading.batches(selectedExamId) });
      qc.invalidateQueries({ queryKey: keys.grading.essayAnswers(selectedExamId) });
      notify.success('تم استيراد درجات الدفعة بنجاح');
    },
    onError: (e) => {
      if (e instanceof AppError && e.details?.importErrors) {
        setImportErrors(e.details.importErrors);
      }
      notify.error(e);
    },
  });

  const approveMut = useMutation({
    mutationFn: () => api.approveGrading(selectedExamId),
    onSuccess: () => {
      setApproveConfirmOpen(false);
      qc.invalidateQueries({ queryKey: keys.exams.detail(selectedExamId) });
      qc.invalidateQueries({ queryKey: keys.grading.results(selectedExamId) });
      qc.invalidateQueries({ queryKey: keys.dashboard.summary });
      notify.success('تم اعتماد النتائج النهائية وإتاحتها للطلاب');
    },
    onError: (e) => notify.error(e),
  });

  const adjustMut = useMutation({
    mutationFn: async () => {
      if (!adjustTarget) return;
      const num = parseDecimalInput(adjustScore);
      const parsed = adjustEssayGradeSchema.safeParse({
        score: num ?? -1,
        reason: adjustReason,
      });
      if (!parsed.success) {
        setAdjustFieldErr(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة');
        throw new Error('VALIDATION');
      }
      if (parsed.data.score > adjustTarget.max_points) {
        setAdjustFieldErr(`الدرجة يجب ألا تتجاوز ${adjustTarget.max_points}`);
        throw new Error('VALIDATION');
      }
      setAdjustFieldErr(undefined);
      await api.adjustEssayGrade(adjustTarget.answer_id, parsed.data.score, parsed.data.reason);
    },
    onSuccess: () => {
      setAdjustTarget(null);
      setAdjustScore('');
      setAdjustReason('');
      qc.invalidateQueries({ queryKey: keys.grading.essayAnswers(selectedExamId) });
      qc.invalidateQueries({ queryKey: keys.grading.results(selectedExamId) });
      notify.success('تم تعديل درجة السؤال المقالي');
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'VALIDATION') return;
      notify.error(e);
    },
  });

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setImportFileName(file.name);
    const buffer = await file.arrayBuffer();
    const { rows, errors } = parseGradesImportBuffer(buffer);
    setParsedRows(rows);
    setImportErrors(errors);
  };

  const batches = batchesQ.data ?? [];
  const isApproved = detailQ.data?.isApproved ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.grading.title}
        subtitle="تصدير واستيراد درجات الأسئلة المقالية بشكل مجهول الهوية واعتماد النتائج النهائية"
        actions={
          selectedExamId &&
          canApprove && (
            <Button
              disabled={isApproved}
              onClick={() => setApproveConfirmOpen(true)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {isApproved ? 'النتائج معتمدة نهائيًا' : ar.grading.approveGrading}
            </Button>
          )
        }
      />

      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-medium text-sky-900">
        {ar.grading.anonymityNotice}
      </div>

      <Surface className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700">
            اختر الامتحان:
            <select
              value={selectedExamId}
              onChange={(e) => {
                setSelectedExamId(e.target.value);
                setParsedRows([]);
                setImportErrors([]);
              }}
              className="mr-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
          </label>
          {detailQ.data && (
            <StatusTag
              tone={isApproved ? 'success' : 'warning'}
              label={isApproved ? 'معتمد نهائيًا' : 'بانتظار الاعتماد'}
            />
          )}
        </div>

        {canReadEssayAdmin && (
          <div className="flex gap-2">
            <Button
              variant={activeTab === 'batches' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('batches')}
            >
              دفعات التصحيح المجهولة
            </Button>
            <Button
              variant={activeTab === 'essay' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('essay')}
            >
              مراجعة الأسئلة المقالية
            </Button>
          </div>
        )}
      </Surface>

      {examsQ.isLoading ? (
        <SkeletonRows rows={4} />
      ) : exams.length === 0 ? (
        <EmptyState title="لا توجد امتحانات منشورة متاحة للتصحيح" />
      ) : activeTab === 'batches' ? (
        <div className="space-y-6">
          {canExportImport && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Surface className="space-y-4">
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-g700" />
                  <h2 className="text-base font-bold text-slate-900">1. {ar.grading.exportBatch}</h2>
                </div>
                <p className="text-xs text-slate-600">
                  يصدر النظام ملف Excel بأكواد إجابات مشفرة (answer_code) دون أي أسماء أو أرقام هواتف للطلاب.
                </p>
                <Button
                  loading={exportMut.isPending}
                  disabled={!selectedExamId || isApproved}
                  onClick={() => exportMut.mutate()}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {ar.grading.exportBatch}
                </Button>
              </Surface>

              <Surface className="space-y-4">
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-g700" />
                  <h2 className="text-base font-bold text-slate-900">2. {ar.grading.importBatch}</h2>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    اختر دفعة التصدير المستهدفة:
                  </label>
                  <select
                    value={selectedBatchId}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    disabled={isApproved || batches.length === 0}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  >
                    {batches.length === 0 && <option value="">لا توجد دفعات مصدّرة بعد</option>}
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {formatCairoDateTime(b.exported_at)} ({b.rows_count} صف)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => void handleFileSelected(e.target.files?.[0])}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isApproved || !selectedBatchId}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    اختيار ملف الدرجات (Excel / CSV)
                  </Button>
                  {importFileName && (
                    <span className="text-xs text-slate-600">{importFileName}</span>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={aiGraded}
                    onChange={(e) => setAiGraded(e.target.checked)}
                    disabled={isApproved}
                  />
                  {ar.grading.aiGradedLabel}
                </label>

                {parsedRows.length > 0 && (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-800">
                      معاينة الملف: {parsedRows.length} صف صالح
                      {importErrors.length > 0 ? ` · ${importErrors.length} خطأ` : ''}
                    </p>
                    <div className="max-h-40 overflow-y-auto rounded border border-slate-200 bg-white">
                      <table className="w-full text-right text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-2 py-1.5">answer_code</th>
                            <th className="px-2 py-1.5">السؤال #</th>
                            <th className="px-2 py-1.5">الدرجة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                          {parsedRows.slice(0, 10).map((r, i) => (
                            <tr key={`${r.answer_code}-${i}`}>
                              <td className="px-2 py-1">{r.answer_code}</td>
                              <td className="px-2 py-1">{r.question_position}</td>
                              <td className="px-2 py-1 font-bold text-g700">{r.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      loading={importMut.isPending}
                      disabled={importErrors.length > 0 || !selectedBatchId || isApproved}
                      onClick={() => importMut.mutate()}
                    >
                      اعتماد استيراد الدرجات ({parsedRows.length})
                    </Button>
                  </div>
                )}

                {importErrors.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="mb-2 text-xs font-bold text-red-900">
                      أخطاء في ملف الاستيراد ({importErrors.length}):
                    </p>
                    <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-red-800">
                      {importErrors.map((err, idx) => (
                        <li key={idx}>
                          صف {err.row} ({err.code}): {err.message ?? ar.errors.IMPORT_REJECTED}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Surface>
            </div>
          )}

          <Surface>
            <h2 className="mb-4 text-base font-bold text-slate-900">{ar.grading.batchHistory}</h2>
            {batchesQ.isLoading ? (
              <SkeletonRows rows={3} />
            ) : batchesQ.error ? (
              <ErrorState error={batchesQ.error} onRetry={() => batchesQ.refetch()} />
            ) : batches.length === 0 ? (
              <EmptyState title="لم يتم تصدير أي دفعات تصحيح لهذا الامتحان بعد" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-right text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5">رقم الدفعة</th>
                      <th className="px-4 py-2.5">تاريخ التصدير</th>
                      <th className="px-4 py-2.5">بواسطة</th>
                      <th className="px-4 py-2.5">عدد الصفوف</th>
                      <th className="px-4 py-2.5">تاريخ الاستيراد</th>
                      <th className="px-4 py-2.5">تصحيح ذكاء اصطناعي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batches.map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-2.5 font-mono text-xs">{b.id}</td>
                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                          {formatCairoDateTime(b.exported_at)}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{b.exported_by_name ?? b.exported_by}</td>
                        <td className="px-4 py-2.5 font-mono tabular-nums">{b.rows_count}</td>
                        <td className="px-4 py-2.5 font-mono text-xs tabular-nums">
                          {b.imported_at ? (
                            <StatusTag tone="success" label={formatCairoDateTime(b.imported_at)} />
                          ) : (
                            <StatusTag tone="warning" label="بانتظار الاستيراد" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {b.ai_graded ? ar.app.yes : ar.app.no}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </div>
      ) : (
        <Surface>
          <h2 className="mb-4 text-base font-bold text-slate-900">{ar.grading.essayReviewTitle}</h2>
          {essayQ.isLoading ? (
            <SkeletonRows rows={4} />
          ) : essayQ.error ? (
            <ErrorState error={essayQ.error} onRetry={() => essayQ.refetch()} />
          ) : (essayQ.data ?? []).length === 0 ? (
            <EmptyState title="لا توجد إجابات مقالية مسجلة لهذا الامتحان" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">الطالب</th>
                    <th className="px-4 py-2.5">السؤال #</th>
                    <th className="px-4 py-2.5">إجابة الطالب</th>
                    <th className="px-4 py-2.5">الدرجة</th>
                    <th className="px-4 py-2.5">سبب التعديل</th>
                    {canAdjustEssay && <th className="px-4 py-2.5">{ar.app.actions}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(essayQ.data ?? []).map((row) => (
                    <tr key={row.answer_id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.student_name}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="font-mono font-bold">#{row.question_position}</span>{' '}
                        <span className="text-slate-600">{row.question_text}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 max-w-md">{row.answer_text}</td>
                      <td className="px-4 py-3 font-mono tabular-nums font-bold">
                        {row.score} / {row.max_points}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{row.adjust_reason ?? '—'}</td>
                      {canAdjustEssay && (
                        <td className="px-4 py-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setAdjustTarget(row);
                              setAdjustScore(String(row.score));
                              setAdjustReason('');
                              setAdjustFieldErr(undefined);
                            }}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            {ar.grading.adjustGrade}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      )}

      <ConfirmDialog
        open={approveConfirmOpen}
        title={ar.grading.approveGrading}
        message={ar.grading.approveWarning}
        confirmLabel={ar.grading.approveGrading}
        loading={approveMut.isPending}
        onConfirm={() => approveMut.mutate()}
        onClose={() => setApproveConfirmOpen(false)}
      >
        {detailQ.data && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 text-slate-700">
            <p>الامتحان: {detailQ.data.exam.title}</p>
            <p className="tabular-nums">عدد الأسئلة: {detailQ.data.questions.length}</p>
            <p className="tabular-nums">عدد الجلسات: {detailQ.data.sessions.length}</p>
            <p className="tabular-nums">دفعات التصحيح: {batches.length}</p>
          </div>
        )}
      </ConfirmDialog>

      <ModalShell
        open={Boolean(adjustTarget)}
        title={ar.grading.adjustGrade}
        onClose={() => setAdjustTarget(null)}
        maxWidth="max-w-md"
      >
        {adjustTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1">
              <p className="font-semibold text-slate-900">الطالب: {adjustTarget.student_name}</p>
              <p className="text-slate-600">{adjustTarget.question_text}</p>
              <p className="text-slate-800 border-t border-slate-200 pt-1">{adjustTarget.answer_text}</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                الدرجة الجديدة (الحد الأقصى {adjustTarget.max_points})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={adjustScore}
                onChange={(e) => setAdjustScore(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {ar.grading.adjustReason}
              </label>
              <textarea
                rows={3}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <FieldError message={adjustFieldErr} />

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdjustTarget(null)}>
                {ar.app.cancel}
              </Button>
              <Button loading={adjustMut.isPending} onClick={() => adjustMut.mutate()}>
                {ar.app.save}
              </Button>
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
