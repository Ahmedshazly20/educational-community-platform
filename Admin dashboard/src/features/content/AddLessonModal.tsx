import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { AudienceBanner, Button, FieldError, ModalShell } from '../../components/ui/Primitives';

export function AddLessonModal({
  open,
  onClose,
  initialStageId = '',
  initialTrackId = '',
  initialCourseId = '',
  initialTermId = '',
}: {
  open: boolean;
  onClose: () => void;
  initialStageId?: string;
  initialTrackId?: string;
  initialCourseId?: string;
  initialTermId?: string;
}) {
  const navigate = useNavigate();
  const notify = useNotify();

  const stagesQ = useQuery({ queryKey: keys.academic.stages, queryFn: () => api.getStages() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });
  const coursesQ = useQuery({ queryKey: keys.academic.courses, queryFn: () => api.getCourses() });
  const trackCoursesQ = useQuery({
    queryKey: keys.academic.trackCourses,
    queryFn: () => api.getTrackCourses(),
  });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });

  const [stageId, setStageId] = React.useState(initialStageId);
  const [trackId, setTrackId] = React.useState(initialTrackId);
  const [courseId, setCourseId] = React.useState(initialCourseId);
  const [termId, setTermId] = React.useState(initialTermId);
  const [title, setTitle] = React.useState('');
  const [summary, setSummary] = React.useState('');
  const [validationErr, setValidationErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setStageId(initialStageId);
      setTrackId(initialTrackId);
      setCourseId(initialCourseId);
      setTermId(initialTermId || (termsQ.data?.[0]?.id ?? ''));
      setTitle('');
      setSummary('');
      setValidationErr(null);
    }
  }, [initialCourseId, initialStageId, initialTermId, initialTrackId, open, termsQ.data]);

  const stages = stagesQ.data ?? [];
  const tracks = tracksQ.data ?? [];
  const courses = coursesQ.data ?? [];
  const trackCourses = trackCoursesQ.data ?? [];
  const terms = termsQ.data ?? [];

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

  const createMut = useMutation({
    mutationFn: () =>
      api.createLesson({
        course_id: courseId,
        term_id: termId,
        title,
        summary: summary || null,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: keys.content.all });
      onClose();
      notify.success('تم إنشاء مسودة الدرس بنجاح');
      navigate(`/content/lessons/${created.id}`);
    },
    onError: (e) => notify.error(e),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageId || !trackId || !courseId || !termId) {
      setValidationErr('يرجى استكمال اختيار الصف والمسار والمادة والترم.');
      return;
    }
    if (title.trim().length < 2 || title.trim().length > 200) {
      setValidationErr('عنوان الدرس يجب أن يكون بين 2 و 200 حرف.');
      return;
    }
    setValidationErr(null);
    createMut.mutate();
  };

  return (
    <ModalShell open={open} title={ar.content.addLesson} onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {ar.content.contextHelper}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="add-lesson-stage" className="mb-1 block text-xs font-medium text-slate-700">
              الصف الدراسي *
            </label>
            <select
              id="add-lesson-stage"
              required
              value={stageId}
              onChange={(e) => {
                setStageId(e.target.value);
                setTrackId('');
                setCourseId('');
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            <label htmlFor="add-lesson-track" className="mb-1 block text-xs font-medium text-slate-700">
              القسم / المسار *
            </label>
            <select
              id="add-lesson-track"
              required
              disabled={!stageId}
              value={trackId}
              onChange={(e) => {
                setTrackId(e.target.value);
                setCourseId('');
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">اختر المسار...</option>
              {filteredTracks.map((t) => (
                <option key={t.id} value={t.id} className={!t.is_active ? 'text-slate-400' : ''}>
                  {t.name_ar} {!t.is_active ? '(غير نشط للتسجيل)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="add-lesson-course" className="mb-1 block text-xs font-medium text-slate-700">
              المادة *
            </label>
            <select
              id="add-lesson-course"
              required
              disabled={!trackId}
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
            <label htmlFor="add-lesson-term" className="mb-1 block text-xs font-medium text-slate-700">
              الترم *
            </label>
            <select
              id="add-lesson-term"
              required
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
          <label htmlFor="add-lesson-title" className="mb-1 block text-sm font-medium text-slate-700">
            {ar.content.lessonTitle} *
          </label>
          <input
            id="add-lesson-title"
            required
            minLength={2}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: قانون كيرشوف الأول والثاني"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="add-lesson-summary" className="mb-1 block text-sm font-medium text-slate-700">
            {ar.content.lessonSummary} ({ar.app.optional})
          </label>
          <textarea
            id="add-lesson-summary"
            rows={3}
            maxLength={1000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {validationErr && <FieldError message={validationErr} />}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {ar.app.cancel}
          </Button>
          <Button type="submit" loading={createMut.isPending}>
            إنشاء الدرس والانتقال للمحرر
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
