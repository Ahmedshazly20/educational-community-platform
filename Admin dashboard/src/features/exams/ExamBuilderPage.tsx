import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  Lock,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { ExamQuestion, ImportErrorDetail, QuestionType } from '../../data/types';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { computeExamCoveragePreview } from '../../lib/exam-coverage';
import { formatCairoDateTime } from '../../lib/format';
import { checkExamPublishable } from '../../lib/publish-checklist';
import {
  buildQuestionsTemplateWorkbook,
  downloadUint8ArrayAsFile,
  parseQuestionsExcelBuffer,
} from '../../lib/xlsx';
import {
  AudienceBanner,
  Button,
  ErrorState,
  ModalShell,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';

type WizardStep = 'basics' | 'questions' | 'sessions' | 'review';

export function ExamBuilderPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const isNew = !id;

  const [step, setStep] = React.useState<WizardStep>('basics');

  // Reference data
  const stagesQ = useQuery({ queryKey: keys.academic.stages, queryFn: () => api.getStages() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });
  const coursesQ = useQuery({ queryKey: keys.academic.courses, queryFn: () => api.getCourses() });
  const trackCoursesQ = useQuery({ queryKey: keys.academic.trackCourses, queryFn: () => api.getTrackCourses() });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });
  const govsQ = useQuery({ queryKey: keys.academic.governorates, queryFn: () => api.getGovernorates() });
  const adminsQ = useQuery({ queryKey: keys.academic.administrations(), queryFn: () => api.getAdministrations() });
  const studentsPreviewQ = useQuery({
    queryKey: keys.students.list({ pageSize: 1000 }),
    queryFn: () => api.getStudents({ pageSize: 1000 }),
  });

  const detailQ = useQuery({
    queryKey: keys.exams.detail(id ?? 'new'),
    queryFn: () => api.getExamDetail(id ?? ''),
    enabled: Boolean(id),
  });

  // Basics form
  const [stageId, setStageId] = React.useState('');
  const [trackId, setTrackId] = React.useState('');
  const [courseId, setCourseId] = React.useState('');
  const [termId, setTermId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [durationMinutes, setDurationMinutes] = React.useState(60);
  const [lateEntryMinutes, setLateEntryMinutes] = React.useState(30);
  const [disconnectGraceSeconds, setDisconnectGraceSeconds] = React.useState(300);

  // Question modal
  const [qModal, setQModal] = React.useState<ExamQuestion | 'new' | null>(null);
  const [qType, setQType] = React.useState<QuestionType>('mcq');
  const [qPrompt, setQPrompt] = React.useState('');
  const [qPoints, setQPoints] = React.useState(2);
  const [qOptions, setQOptions] = React.useState<Array<{ text: string; isCorrect: boolean }>>([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
  ]);

  // Excel import
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = React.useState<ImportErrorDetail[]>([]);

  // Session modal
  const [sessModal, setSessModal] = React.useState(false);
  const [sessName, setSessName] = React.useState('');
  const [sessStart, setSessStart] = React.useState('');
  const [sessAudiences, setSessAudiences] = React.useState<
    Array<{ governorate_id: string | null; administration_id: string | null; track_id: string | null }>
  >([{ governorate_id: null, administration_id: null, track_id: null }]);

  React.useEffect(() => {
    if (detailQ.data) {
      const { exam, tracks } = detailQ.data;
      setCourseId(exam.course_id);
      setTermId(exam.term_id);
      setTitle(exam.title);
      setDescription(exam.description ?? '');
      setDurationMinutes(exam.duration_minutes);
      setLateEntryMinutes(exam.late_entry_minutes);
      setDisconnectGraceSeconds(exam.disconnect_grace_seconds);
      if (tracks[0]) {
        setStageId(tracks[0].stage.id);
        setTrackId(tracks[0].track.id);
      }
    } else if (isNew && termsQ.data?.[0] && !termId) {
      setTermId(termsQ.data[0].id);
    }
  }, [detailQ.data, isNew, termId, termsQ.data]);

  const stages = stagesQ.data ?? [];
  const tracks = tracksQ.data ?? [];
  const courses = coursesQ.data ?? [];
  const trackCourses = trackCoursesQ.data ?? [];
  const terms = termsQ.data ?? [];
  const govs = govsQ.data ?? [];
  const admins = adminsQ.data ?? [];

  const filteredTracks = tracks.filter((t) => t.stage_id === stageId);
  const filteredCourses = courses.filter((c) =>
    trackCourses.some((tc) => tc.track_id === trackId && tc.course_id === c.id)
  );

  const courseAudienceTracks = trackCourses
    .filter((tc) => tc.course_id === courseId)
    .map((tc) => {
      const tr = tracks.find((t) => t.id === tc.track_id);
      const st = tr ? stages.find((s) => s.id === tr.stage_id) : undefined;
      return tr && st ? { trackName: tr.name_ar, stageName: st.name_ar } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const invalidate = () => {
    if (id) void queryClient.invalidateQueries({ queryKey: keys.exams.detail(id) });
    void queryClient.invalidateQueries({ queryKey: ['exams'] });
  };

  const saveBasicsMut = useMutation({
    mutationFn: async () => {
      const payload = {
        course_id: courseId,
        term_id: termId,
        title,
        description: description || null,
        duration_minutes: durationMinutes,
        late_entry_minutes: lateEntryMinutes,
        disconnect_grace_seconds: disconnectGraceSeconds,
      };
      if (isNew) return api.createExam(payload);
      return api.updateExam(id, payload);
    },
    onSuccess: (saved) => {
      invalidate();
      notify.success('تم حفظ بيانات الامتحان');
      if (isNew) {
        navigate(`/exams/${saved.id}/edit`, { replace: true });
      }
      setStep('questions');
    },
    onError: (e) => notify.error(e),
  });

  const saveQuestionMut = useMutation({
    mutationFn: () => {
      if (!id) throw new Error('no exam');
      return api.upsertExamQuestion({
        id: qModal && qModal !== 'new' ? qModal.id : undefined,
        exam_id: id,
        question_type: qType,
        prompt_html: qPrompt.startsWith('<') ? qPrompt : `<p>${qPrompt}</p>`,
        points: qPoints,
        options:
          qType === 'mcq'
            ? qOptions
                .filter((o) => o.text.trim())
                .map((o, idx) => ({
                  option_text: o.text.trim(),
                  is_correct: o.isCorrect,
                  sort_order: idx + 1,
                }))
            : [],
      });
    },
    onSuccess: () => {
      invalidate();
      setQModal(null);
      notify.success('تم حفظ السؤال');
    },
    onError: (e) => notify.error(e),
  });

  const deleteQuestionMut = useMutation({
    mutationFn: (qId: string) => api.deleteExamQuestion(id ?? '', qId),
    onSuccess: () => {
      invalidate();
      notify.success('تم حذف السؤال');
    },
    onError: (e) => notify.error(e),
  });

  const reorderQMut = useMutation({
    mutationFn: (questions: ExamQuestion[]) =>
      api.reorderExamQuestions(
        id ?? '',
        questions.map((q, idx) => ({
          id: q.id,
          exam_id: q.exam_id,
          position: idx + 1,
          prompt_html: q.prompt_html,
          points: q.points,
        }))
      ),
    onSuccess: () => {
      invalidate();
      notify.success('تم حفظ ترتيب الأسئلة');
    },
    onError: (e) => notify.error(e),
  });

  const createSessionMut = useMutation({
    mutationFn: () => {
      if (!id) throw new Error('no exam');
      return api.createExamSession({
        exam_id: id,
        name: sessName,
        starts_at: new Date(sessStart).toISOString(),
        audiences: sessAudiences,
      });
    },
    onSuccess: () => {
      invalidate();
      setSessModal(false);
      notify.success('تمت إضافة الجلسة');
    },
    onError: (e) => notify.error(e),
  });

  const deleteSessionMut = useMutation({
    mutationFn: (sessionId: string) => api.deleteExamSession(id ?? '', sessionId),
    onSuccess: () => {
      invalidate();
      notify.success('تم حذف الجلسة');
    },
    onError: (e) => notify.error(e),
  });

  const statusMut = useMutation({
    mutationFn: (status: 'draft' | 'published' | 'archived') =>
      api.setExamStatus(id ?? '', status),
    onSuccess: () => {
      invalidate();
      notify.success('تم تحديث حالة الامتحان');
    },
    onError: (e) => notify.error(e),
  });

  const handleExcelFile = async (file: File) => {
    if (!id) return;
    setImportErrors([]);
    const buf = await file.arrayBuffer();
    const parsed = parseQuestionsExcelBuffer(buf);
    if (parsed.errors.length > 0) {
      setImportErrors(parsed.errors);
      notify.error(new Error('IMPORT_REJECTED'));
      return;
    }
    try {
      const count = await api.bulkImportExamQuestions(
        id,
        parsed.valid.map((q) => ({
          question_type: q.question_type,
          prompt_html: `<p>${q.prompt}</p>`,
          points: q.points,
          options: q.options,
        }))
      );
      invalidate();
      notify.success(`تم استيراد ${count} سؤال بنجاح`);
    } catch (e) {
      notify.error(e);
    }
  };

  if (!isNew && detailQ.isLoading) {
    return (
      <div>
        <PageHeader title={ar.exams.title} />
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (!isNew && detailQ.error) {
    return (
      <div>
        <PageHeader title={ar.exams.title} />
        <ErrorState error={detailQ.error} onRetry={() => detailQ.refetch()} />
      </div>
    );
  }

  const detail = detailQ.data;
  const isLocked = detail?.isLocked ?? false;
  const questions = detail?.questions ?? [];
  const sessions = detail?.sessions ?? [];
  const audiences = detail?.audiences ?? [];
  const totalPoints = questions.reduce((acc, q) => acc + q.points, 0);

  const coverage = detail
    ? computeExamCoveragePreview({
        sessions,
        audiences,
        eligibleCourseTrackIds: detail.tracks.map((t) => t.track.id),
        governorates: govs,
        tracks,
        students: studentsPreviewQ.data?.items ?? [],
      })
    : null;

  const publishCheck = detail
    ? checkExamPublishable({
        courseId: detail.exam.course_id,
        trackCourses,
        questions,
        sessions,
        audiences,
        hasAmbiguity: coverage?.hasAmbiguity ?? false,
      })
    : null;

  const openQuestionModal = (q?: ExamQuestion) => {
    if (q) {
      setQModal(q);
      setQType(q.question_type);
      setQPrompt(q.prompt_html.replace(/<[^>]+>/g, ''));
      setQPoints(q.points);
      setQOptions(
        q.options.length > 0
          ? q.options.map((o) => ({ text: o.option_text, isCorrect: o.is_correct }))
          : [
              { text: '', isCorrect: true },
              { text: '', isCorrect: false },
            ]
      );
    } else {
      setQModal('new');
      setQType('mcq');
      setQPrompt('');
      setQPoints(2);
      setQOptions([
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
      ]);
    }
  };

  const duplicateQuestion = async (q: ExamQuestion) => {
    if (!id || isLocked) return;
    try {
      await api.upsertExamQuestion({
        exam_id: id,
        question_type: q.question_type,
        prompt_html: q.prompt_html,
        points: q.points,
        options: q.options.map((o, idx) => ({
          option_text: o.option_text,
          is_correct: o.is_correct,
          sort_order: idx + 1,
        })),
      });
      invalidate();
      notify.success('تم تكرار السؤال');
    } catch (e) {
      notify.error(e);
    }
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const next = [...questions];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    const a = next[idx];
    const b = next[swap];
    if (!a || !b) return;
    next[idx] = b;
    next[swap] = a;
    reorderQMut.mutate(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? ar.exams.newExam : detail?.exam.title ?? ar.exams.title}
        actions={
          <div className="flex items-center gap-2">
            {isLocked && <StatusTag tone="danger" label={ar.exams.lockedBadge} />}
            {detail && detail.exam.status !== 'archived' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => statusMut.mutate('archived')}
              >
                <Archive className="h-4 w-4" />
                أرشفة
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate('/exams')}>
              <ArrowRight className="h-4 w-4" />
              العودة للامتحانات
            </Button>
          </div>
        }
      />

      {isLocked && (
        <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          <Lock className="h-4 w-4 shrink-0" />
          <span>{ar.exams.lockedBanner}</span>
        </div>
      )}

      {/* Steps bar */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {(['basics', 'questions', 'sessions', 'review'] as WizardStep[]).map((st) => (
          <button
            key={st}
            type="button"
            disabled={isNew && st !== 'basics'}
            onClick={() => setStep(st)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              step === st ? 'bg-g700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {ar.exams.steps[st]}
          </button>
        ))}
      </div>

      {/* Step 1: Basics */}
      {step === 'basics' && (
        <Surface>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveBasicsMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="ex-stage" className="mb-1 block text-xs font-medium">
                  الصف الدراسي *
                </label>
                <select
                  id="ex-stage"
                  required
                  disabled={isLocked}
                  value={stageId}
                  onChange={(e) => {
                    setStageId(e.target.value);
                    setTrackId('');
                    setCourseId('');
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  <option value="">اختر الصف...</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name_ar}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ex-track" className="mb-1 block text-xs font-medium">
                  المسار *
                </label>
                <select
                  id="ex-track"
                  required
                  disabled={isLocked || !stageId}
                  value={trackId}
                  onChange={(e) => {
                    setTrackId(e.target.value);
                    setCourseId('');
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  <option value="">اختر المسار...</option>
                  {filteredTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name_ar}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ex-course" className="mb-1 block text-xs font-medium">
                  المادة *
                </label>
                <select
                  id="ex-course"
                  required
                  disabled={isLocked || !trackId}
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  <option value="">اختر المادة...</option>
                  {filteredCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ar}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ex-term" className="mb-1 block text-xs font-medium">
                  الترم *
                </label>
                <select
                  id="ex-term"
                  required
                  disabled={isLocked}
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  <option value="">اختر الترم...</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {courseId && <AudienceBanner tracks={courseAudienceTracks} />}

            <div>
              <label htmlFor="ex-title" className="mb-1 block text-sm font-medium">
                عنوان الامتحان *
              </label>
              <input
                id="ex-title"
                required
                disabled={isLocked}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </div>

            <div>
              <label htmlFor="ex-desc" className="mb-1 block text-sm font-medium">
                الوصف / التعليمات ({ar.app.optional})
              </label>
              <textarea
                id="ex-desc"
                rows={2}
                disabled={isLocked}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="ex-dur" className="mb-1 block text-xs font-medium">
                  {ar.exams.durationMinutes} (5–300)
                </label>
                <input
                  id="ex-dur"
                  type="number"
                  min={5}
                  max={300}
                  required
                  disabled={isLocked}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-100"
                />
              </div>
              <div>
                <label htmlFor="ex-late" className="mb-1 block text-xs font-medium">
                  {ar.exams.lateEntryMinutes} (0–60)
                </label>
                <input
                  id="ex-late"
                  type="number"
                  min={0}
                  max={60}
                  required
                  disabled={isLocked}
                  value={lateEntryMinutes}
                  onChange={(e) => setLateEntryMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-100"
                />
              </div>
              <div>
                <label htmlFor="ex-grace" className="mb-1 block text-xs font-medium">
                  {ar.exams.disconnectGraceSeconds} (30–1800)
                </label>
                <input
                  id="ex-grace"
                  type="number"
                  min={30}
                  max={1800}
                  required
                  disabled={isLocked}
                  value={disconnectGraceSeconds}
                  onChange={(e) => setDisconnectGraceSeconds(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-100"
                />
              </div>
            </div>

            {!isLocked && (
              <div className="flex justify-end">
                <Button type="submit" loading={saveBasicsMut.isPending}>
                  حفظ والمتابعة للأسئلة
                </Button>
              </div>
            )}
          </form>
        </Surface>
      )}

      {/* Step 2: Questions */}
      {step === 'questions' && detail && (
        <Surface className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold">
                الأسئلة ({questions.length}) · إجمالي الدرجات:{' '}
                <span className="font-mono tabular-nums text-g700">{totalPoints}</span>
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  downloadUint8ArrayAsFile(buildQuestionsTemplateWorkbook(), 'questions-template.xlsx')
                }
              >
                <Download className="h-4 w-4" />
                {ar.exams.downloadTemplate}
              </Button>
              {!isLocked && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {ar.exams.importQuestionsExcel}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleExcelFile(f);
                      e.target.value = '';
                    }}
                  />
                  <Button size="sm" onClick={() => openQuestionModal()}>
                    <Plus className="h-4 w-4" />
                    إضافة سؤال
                  </Button>
                </>
              )}
            </div>
          </div>

          {importErrors.length > 0 && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 space-y-2">
              <p className="text-sm font-bold text-red-900">
                فشل استيراد الأسئلة — لم يتم حفظ أي صف بسبب الأخطاء التالية:
              </p>
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-red-200 text-red-800">
                    <th className="py-1">رقم الصف</th>
                    <th className="py-1">الخطأ</th>
                  </tr>
                </thead>
                <tbody>
                  {importErrors.map((err, i) => (
                    <tr key={i}>
                      <td className="py-1 font-mono tabular-nums">{err.row}</td>
                      <td className="py-1 text-red-900">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">لا توجد أسئلة بعد.</p>
          ) : (
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500">#{q.position}</span>
                      <StatusTag
                        tone={q.question_type === 'mcq' ? 'info' : 'neutral'}
                        label={ar.exams.questionTypes[q.question_type]}
                      />
                      <span className="font-mono text-xs font-semibold tabular-nums text-g700">
                        {q.points} درجة
                      </span>
                    </div>
                    {!isLocked && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() => moveQuestion(idx, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={idx === questions.length - 1}
                          onClick={() => moveQuestion(idx, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => duplicateQuestion(q)}
                          aria-label="تكرار السؤال"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openQuestionModal(q)}>
                          {ar.app.edit}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => deleteQuestionMut.mutate(q.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div
                    className="mt-2 text-sm text-slate-800"
                    dangerouslySetInnerHTML={{ __html: q.prompt_html }}
                  />
                  {q.question_type === 'mcq' && (
                    <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 text-xs">
                      {q.options.map((o) => (
                        <li
                          key={o.id}
                          className={`rounded border px-2.5 py-1.5 ${
                            o.is_correct
                              ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900'
                              : 'border-slate-200 text-slate-700'
                          }`}
                        >
                          {o.option_text} {o.is_correct ? '✓' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {/* Step 3: Sessions & Audience */}
      {step === 'sessions' && detail && (
        <div className="space-y-6">
          <Surface className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">الجلسات ({sessions.length})</h2>
              {!isLocked && (
                <Button
                  size="sm"
                  onClick={() => {
                    setSessName('');
                    setSessStart('');
                    setSessAudiences([{ governorate_id: null, administration_id: null, track_id: null }]);
                    setSessModal(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {ar.exams.addSession}
                </Button>
              )}
            </div>

            {coverage?.hasAmbiguity && (
              <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold text-red-900">
                {ar.exams.ambiguityWarning}
              </div>
            )}

            {sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">لا توجد جلسات مضافة بعد.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => {
                  const sAuds = audiences.filter((a) => a.session_id === s.id);
                  const countInfo = coverage?.sessionCounts.find((c) => c.sessionId === s.id);
                  return (
                    <div key={s.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{s.name}</p>
                          <p className="font-mono text-xs tabular-nums text-slate-600">
                            {formatCairoDateTime(s.starts_at)} ⟵ {formatCairoDateTime(s.ends_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-g700 tabular-nums">
                            الطلاب المشمولون: {countInfo?.count ?? 0}
                          </span>
                          {!isLocked && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => deleteSessionMut.mutate(s.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        {sAuds.map((a) => {
                          const gName = govs.find((g) => g.id === a.governorate_id)?.name_ar ?? 'كل المحافظات';
                          const aName = admins.find((ad) => ad.id === a.administration_id)?.name_ar ?? 'كل الإدارات';
                          const tName = tracks.find((t) => t.id === a.track_id)?.name_ar ?? 'كل مسارات المادة';
                          return (
                            <span key={a.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                              {gName} · {aName} · {tName}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Surface>

          {coverage && (
            <Surface className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900">{ar.exams.coveragePreviewTitle}</h3>
              {coverage.uncoveredStudents.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-bold">
                    {ar.exams.uncoveredStudentsTitle}: {coverage.uncoveredStudents.length} طالب
                  </p>
                  <p className="mt-1">
                    {coverage.uncoveredStudents
                      .slice(0, 8)
                      .map((u) => `${u.full_name} (${u.governorate_name} - ${u.track_name})`)
                      .join('، ')}
                  </p>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pl-4">المحافظة</th>
                      <th className="py-2 pl-4">المسار</th>
                      <th className="py-2 pl-4">الجلسة المطابقة</th>
                      <th className="py-2">عدد الطلاب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {coverage.cells.map((c) => (
                      <tr key={`${c.governorateId}-${c.trackId}`}>
                        <td className="py-2 pl-4">{c.governorateName}</td>
                        <td className="py-2 pl-4">{c.trackName}</td>
                        <td className="py-2 pl-4">
                          {c.ambiguous ? (
                            <StatusTag tone="danger" label="تعارض جلستين" />
                          ) : c.sessionName ? (
                            <span className="font-semibold text-g700">{c.sessionName}</span>
                          ) : (
                            <span className="text-amber-700">غير مشمول</span>
                          )}
                        </td>
                        <td className="py-2 font-mono tabular-nums">{c.eligibleStudentsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>
          )}
        </div>
      )}

      {/* Step 4: Review & Publish */}
      {step === 'review' && detail && publishCheck && (
        <Surface className="space-y-4">
          <h2 className="text-base font-bold text-slate-900">مراجعة شروط نشر الامتحان</h2>
          <ul className="space-y-2 text-xs">
            {publishCheck.checks.map((c) => (
              <li
                key={c.id}
                className={`flex items-center gap-2 rounded-lg border p-3 ${
                  c.passed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {c.passed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                <span>{c.label}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-end gap-2 pt-2">
            {detail.exam.status === 'draft' && (
              <Button
                loading={statusMut.isPending}
                onClick={() => statusMut.mutate('published')}
              >
                نشر الامتحان الآن
              </Button>
            )}
            {detail.exam.status === 'published' && (
              <StatusTag tone="success" label="الامتحان منشور بالفعل" />
            )}
          </div>
        </Surface>
      )}

      {/* Question Modal */}
      <ModalShell
        open={Boolean(qModal)}
        title={qModal === 'new' ? 'إضافة سؤال' : 'تعديل سؤال'}
        onClose={() => setQModal(null)}
        maxWidth="max-w-xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveQuestionMut.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="q-type" className="mb-1 block text-xs font-medium">
                نوع السؤال
              </label>
              <select
                id="q-type"
                value={qType}
                onChange={(e) => setQType(e.target.value as QuestionType)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="mcq">{ar.exams.questionTypes.mcq}</option>
                <option value="essay">{ar.exams.questionTypes.essay}</option>
              </select>
            </div>
            <div>
              <label htmlFor="q-points" className="mb-1 block text-xs font-medium">
                {ar.exams.points} *
              </label>
              <input
                id="q-points"
                type="number"
                step="0.5"
                min="0.5"
                required
                value={qPoints}
                onChange={(e) => setQPoints(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="q-prompt" className="mb-1 block text-sm font-medium">
              نص السؤال *
            </label>
            <textarea
              id="q-prompt"
              required
              rows={3}
              value={qPrompt}
              onChange={(e) => setQPrompt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {qType === 'mcq' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">الخيارات (2 إلى 6، إجابة صحيحة واحدة)</span>
                {qOptions.length < 6 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setQOptions((p) => [...p, { text: '', isCorrect: false }])}
                  >
                    + خيار
                  </Button>
                )}
              </div>
              {qOptions.map((o, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="eq-correct"
                    checked={o.isCorrect}
                    onChange={() =>
                      setQOptions((p) => p.map((x, i) => ({ ...x, isCorrect: i === idx })))
                    }
                  />
                  <input
                    type="text"
                    required
                    value={o.text}
                    onChange={(e) =>
                      setQOptions((p) =>
                        p.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x))
                      )
                    }
                    placeholder={`الخيار ${idx + 1}`}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  {qOptions.length > 2 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setQOptions((p) => p.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setQModal(null)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={saveQuestionMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Session Modal */}
      <ModalShell open={sessModal} title={ar.exams.addSession} onClose={() => setSessModal(false)} maxWidth="max-w-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createSessionMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="sess-name" className="mb-1 block text-sm font-medium">
              {ar.exams.sessionName} *
            </label>
            <input
              id="sess-name"
              required
              value={sessName}
              onChange={(e) => setSessName(e.target.value)}
              placeholder="مثال: جلسة الجيزة المسائية"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="sess-start" className="mb-1 block text-sm font-medium">
              {ar.exams.startsAt} *
            </label>
            <input
              id="sess-start"
              type="datetime-local"
              required
              value={sessStart}
              onChange={(e) => setSessStart(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
            {sessStart && detail && (
              <p className="mt-1 text-xs text-slate-500">
                {ar.exams.endsAtAuto}:{' '}
                {formatCairoDateTime(
                  new Date(
                    new Date(sessStart).getTime() + detail.exam.duration_minutes * 60 * 1000
                  ).toISOString()
                )}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{ar.exams.audienceRules}</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setSessAudiences((p) => [
                    ...p,
                    { governorate_id: null, administration_id: null, track_id: null },
                  ])
                }
              >
                + قاعدة جمهور
              </Button>
            </div>

            {sessAudiences.map((aud, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 p-2">
                <select
                  value={aud.governorate_id ?? ''}
                  onChange={(e) =>
                    setSessAudiences((p) =>
                      p.map((x, i) =>
                        i === idx
                          ? { ...x, governorate_id: e.target.value || null, administration_id: null }
                          : x
                      )
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="">كل المحافظات</option>
                  {govs.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar}
                    </option>
                  ))}
                </select>
                <select
                  value={aud.administration_id ?? ''}
                  disabled={!aud.governorate_id}
                  onChange={(e) =>
                    setSessAudiences((p) =>
                      p.map((x, i) =>
                        i === idx ? { ...x, administration_id: e.target.value || null } : x
                      )
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-1.5 text-xs disabled:bg-slate-100"
                >
                  <option value="">كل الإدارات</option>
                  {admins
                    .filter((a) => a.governorate_id === aud.governorate_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name_ar}
                      </option>
                    ))}
                </select>
                <select
                  value={aud.track_id ?? ''}
                  onChange={(e) =>
                    setSessAudiences((p) =>
                      p.map((x, i) => (i === idx ? { ...x, track_id: e.target.value || null } : x))
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="">كل المسارات</option>
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSessModal(false)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={createSessionMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
