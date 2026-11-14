import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Link2, Plus, Trash2, Unlink } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { Course, CourseIconKey, Stage, Term, Track } from '../../data/types';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { formatCairoDate } from '../../lib/format';
import { ConfirmDialog } from '../../components/ui/Dialogs';
import {
  Button,
  COURSE_ICON_OPTIONS,
  CourseIcon,
  ErrorState,
  ModalShell,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';

type AcademicTab = 'stages' | 'tracks' | 'courses' | 'terms' | 'coverage';

export function AcademicPage() {
  const notify = useNotify();
  const [tab, setTab] = React.useState<AcademicTab>('stages');

  const stagesQ = useQuery({ queryKey: keys.academic.stages, queryFn: () => api.getStages() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });
  const coursesQ = useQuery({ queryKey: keys.academic.courses, queryFn: () => api.getCourses() });
  const trackCoursesQ = useQuery({
    queryKey: keys.academic.trackCourses,
    queryFn: () => api.getTrackCourses(),
  });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });
  const lessonsQ = useQuery({
    queryKey: keys.content.lessons({ pageSize: 1000 }),
    queryFn: () => api.getLessons({ pageSize: 1000 }),
  });

  // Stage modal
  const [stageModal, setStageModal] = React.useState<Stage | 'new' | null>(null);
  const [stageName, setStageName] = React.useState('');

  // Track modal
  const [trackModal, setTrackModal] = React.useState<Track | 'new' | null>(null);
  const [trackStageId, setTrackStageId] = React.useState('');
  const [trackName, setTrackName] = React.useState('');
  const [trackActive, setTrackActive] = React.useState(true);

  // Course modal & track-links drawer
  const [courseModal, setCourseModal] = React.useState<Course | 'new' | null>(null);
  const [courseName, setCourseName] = React.useState('');
  const [courseIcon, setCourseIcon] = React.useState<CourseIconKey>('book');
  const [courseActive, setCourseActive] = React.useState(true);
  const [managingCourse, setManagingCourse] = React.useState<Course | null>(null);
  const [linkTrackId, setLinkTrackId] = React.useState('');
  const [unlinkTarget, setUnlinkTarget] = React.useState<{ trackId: string; courseId: string; trackName: string } | null>(null);

  // Term modal
  const [termModal, setTermModal] = React.useState<Term | 'new' | null>(null);
  const [termName, setTermName] = React.useState('');
  const [termAccessEnd, setTermAccessEnd] = React.useState('');

  // Dependency delete dialog
  const [deleteTarget, setDeleteTarget] = React.useState<{
    kind: 'stage' | 'track' | 'course' | 'term';
    id: string;
    name: string;
    depsText?: string;
    canDelete: boolean;
  } | null>(null);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: keys.academic.all });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard.summary });
  };

  const saveStageMut = useMutation({
    mutationFn: async () => {
      const stages = stagesQ.data ?? [];
      if (stageModal === 'new') {
        return api.createStage({ name_ar: stageName, sort_order: stages.length + 1 });
      }
      if (stageModal) {
        return api.updateStage(stageModal.id, { name_ar: stageName, sort_order: stageModal.sort_order });
      }
    },
    onSuccess: () => {
      invalidateAll();
      setStageModal(null);
      notify.success('تم حفظ الصف الدراسي');
    },
    onError: (e) => notify.error(e),
  });

  const reorderStageMut = useMutation({
    mutationFn: (items: Array<{ id: string; name_ar: string; sort_order: number }>) =>
      api.reorderStages(items),
    onSuccess: () => {
      invalidateAll();
      notify.success('تم تحديث الترتيب');
    },
    onError: (e) => notify.error(e),
  });

  const saveTrackMut = useMutation({
    mutationFn: async () => {
      const tracks = tracksQ.data ?? [];
      if (trackModal === 'new') {
        return api.createTrack({
          stage_id: trackStageId,
          name_ar: trackName,
          is_active: trackActive,
          sort_order: tracks.length + 1,
        });
      }
      if (trackModal) {
        return api.updateTrack(trackModal.id, {
          stage_id: trackStageId,
          name_ar: trackName,
          is_active: trackActive,
          sort_order: trackModal.sort_order,
        });
      }
    },
    onSuccess: () => {
      invalidateAll();
      setTrackModal(null);
      notify.success('تم حفظ المسار');
    },
    onError: (e) => notify.error(e),
  });

  const saveCourseMut = useMutation({
    mutationFn: async () => {
      const courses = coursesQ.data ?? [];
      if (courseModal === 'new') {
        return api.createCourse({
          name_ar: courseName,
          icon_key: courseIcon,
          is_active: courseActive,
          sort_order: courses.length + 1,
        });
      }
      if (courseModal) {
        return api.updateCourse(courseModal.id, {
          name_ar: courseName,
          icon_key: courseIcon,
          is_active: courseActive,
          sort_order: courseModal.sort_order,
        });
      }
    },
    onSuccess: () => {
      invalidateAll();
      setCourseModal(null);
      notify.success('تم حفظ المادة');
    },
    onError: (e) => notify.error(e),
  });

  const linkTrackMut = useMutation({
    mutationFn: () => {
      if (!managingCourse || !linkTrackId) throw new Error('missing');
      const existingCount = (trackCoursesQ.data ?? []).filter((tc) => tc.track_id === linkTrackId).length;
      return api.linkTrackCourse({
        track_id: linkTrackId,
        course_id: managingCourse.id,
        sort_order: existingCount + 1,
      });
    },
    onSuccess: () => {
      invalidateAll();
      setLinkTrackId('');
      notify.success('تم ربط المادة بالمسار');
    },
    onError: (e) => notify.error(e),
  });

  const unlinkTrackMut = useMutation({
    mutationFn: () => {
      if (!unlinkTarget) throw new Error('missing');
      return api.unlinkTrackCourse(unlinkTarget.trackId, unlinkTarget.courseId);
    },
    onSuccess: () => {
      invalidateAll();
      setUnlinkTarget(null);
      notify.success('تم فك الارتباط');
    },
    onError: (e) => notify.error(e),
  });

  const saveTermMut = useMutation({
    mutationFn: async () => {
      const terms = termsQ.data ?? [];
      const accessIso = termAccessEnd ? new Date(termAccessEnd).toISOString() : null;
      if (termModal === 'new') {
        return api.createTerm({
          name_ar: termName,
          sort_order: terms.length + 1,
          access_ends_at: accessIso,
        });
      }
      if (termModal) {
        return api.updateTerm(termModal.id, {
          name_ar: termName,
          sort_order: termModal.sort_order,
          access_ends_at: accessIso,
        });
      }
    },
    onSuccess: () => {
      invalidateAll();
      setTermModal(null);
      notify.success('تم حفظ الترم');
    },
    onError: (e) => notify.error(e),
  });

  const deleteEntityMut = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      if (deleteTarget.kind === 'stage') return api.deleteStage(deleteTarget.id);
      if (deleteTarget.kind === 'track') return api.deleteTrack(deleteTarget.id);
      if (deleteTarget.kind === 'course') return api.deleteCourse(deleteTarget.id);
      return api.deleteTerm(deleteTarget.id);
    },
    onSuccess: () => {
      invalidateAll();
      setDeleteTarget(null);
      notify.success('تم الحذف بنجاح');
    },
    onError: (e) => notify.error(e),
  });

  const prepareDelete = async (kind: 'stage' | 'track' | 'course' | 'term', id: string, name: string) => {
    try {
      const check =
        kind === 'stage'
          ? await api.checkStageDependencies(id)
          : kind === 'track'
          ? await api.checkTrackDependencies(id)
          : kind === 'course'
          ? await api.checkCourseDependencies(id)
          : await api.checkTermDependencies(id);

      setDeleteTarget({
        kind,
        id,
        name,
        canDelete: check.canDelete,
        depsText: check.dependencies.map((d) => `${d.count} ${d.label}`).join('، '),
      });
    } catch (e) {
      notify.error(e);
    }
  };

  const stages = stagesQ.data ?? [];
  const tracks = tracksQ.data ?? [];
  const courses = coursesQ.data ?? [];
  const trackCourses = trackCoursesQ.data ?? [];
  const terms = termsQ.data ?? [];
  const allLessons = lessonsQ.data?.items ?? [];

  const isLoading = stagesQ.isLoading || tracksQ.isLoading || coursesQ.isLoading || termsQ.isLoading;
  const anyError = stagesQ.error || tracksQ.error || coursesQ.error || termsQ.error;

  const moveStage = (idx: number, dir: -1 | 1) => {
    const next = [...stages];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    const temp = next[idx];
    const target = next[swapIdx];
    if (!temp || !target) return;
    next[idx] = target;
    next[swapIdx] = temp;
    reorderStageMut.mutate(
      next.map((s, i) => ({ id: s.id, name_ar: s.name_ar, sort_order: i + 1 }))
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.academic.title}
        subtitle="إدارة الصفوف، المسارات، المواد وربطها بالمسارات، الترمات، ومصفوفة تغطية المنهج"
      />

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {(Object.keys(ar.academic.tabs) as AcademicTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              tab === t ? 'bg-g700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {ar.academic.tabs[t]}
          </button>
        ))}
      </div>

      {isLoading && <SkeletonRows rows={6} />}
      {anyError && <ErrorState error={anyError} />}

      {!isLoading && !anyError && tab === 'stages' && (
        <Surface>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold">{ar.academic.tabs.stages}</h2>
            <Button
              size="sm"
              onClick={() => {
                setStageName('');
                setStageModal('new');
              }}
            >
              <Plus className="h-4 w-4" />
              إضافة صف دراسي
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pl-4">الترتيب</th>
                  <th className="py-2 pl-4">{ar.academic.stageName}</th>
                  <th className="py-2 pl-4">عدد المسارات</th>
                  <th className="py-2">{ar.app.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stages.map((s, idx) => (
                  <tr key={s.id}>
                    <td className="py-3 pl-4 font-mono tabular-nums">{s.sort_order}</td>
                    <td className="py-3 pl-4 font-semibold">{s.name_ar}</td>
                    <td className="py-3 pl-4 font-mono tabular-nums">
                      {tracks.filter((t) => t.stage_id === s.id).length}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() => moveStage(idx, -1)}
                          aria-label={`تحريك ${s.name_ar} لأعلى`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={idx === stages.length - 1}
                          onClick={() => moveStage(idx, 1)}
                          aria-label={`تحريك ${s.name_ar} لأسفل`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setStageName(s.name_ar);
                            setStageModal(s);
                          }}
                        >
                          {ar.app.edit}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => prepareDelete('stage', s.id, s.name_ar)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {!isLoading && !anyError && tab === 'tracks' && (
        <Surface className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            {ar.academic.isActiveCaveat}
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{ar.academic.tabs.tracks}</h2>
            <Button
              size="sm"
              onClick={() => {
                setTrackStageId(stages[0]?.id ?? '');
                setTrackName('');
                setTrackActive(true);
                setTrackModal('new');
              }}
            >
              <Plus className="h-4 w-4" />
              إضافة مسار
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pl-4">{ar.academic.stageName}</th>
                  <th className="py-2 pl-4">{ar.academic.trackName}</th>
                  <th className="py-2 pl-4">الحالة للتسجيل</th>
                  <th className="py-2 pl-4">المواد المرتبطة</th>
                  <th className="py-2">{ar.app.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tracks.map((tr) => {
                  const st = stages.find((s) => s.id === tr.stage_id);
                  const cCount = trackCourses.filter((tc) => tc.track_id === tr.id).length;
                  return (
                    <tr key={tr.id}>
                      <td className="py-3 pl-4 text-slate-600">{st?.name_ar ?? '—'}</td>
                      <td className="py-3 pl-4 font-semibold">{tr.name_ar}</td>
                      <td className="py-3 pl-4">
                        <StatusTag
                          tone={tr.is_active ? 'success' : 'neutral'}
                          label={tr.is_active ? 'متاح للتسجيل' : 'متوقف للتسجيل'}
                        />
                      </td>
                      <td className="py-3 pl-4 font-mono tabular-nums">{cCount}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setTrackStageId(tr.stage_id);
                              setTrackName(tr.name_ar);
                              setTrackActive(tr.is_active);
                              setTrackModal(tr);
                            }}
                          >
                            {ar.app.edit}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => prepareDelete('track', tr.id, tr.name_ar)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {!isLoading && !anyError && tab === 'courses' && (
        <Surface className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
            {ar.academic.courseActiveCaveat}
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{ar.academic.tabs.courses}</h2>
            <Button
              size="sm"
              onClick={() => {
                setCourseName('');
                setCourseIcon('book');
                setCourseActive(true);
                setCourseModal('new');
              }}
            >
              <Plus className="h-4 w-4" />
              إضافة مادة
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pl-4">{ar.academic.courseName}</th>
                  <th className="py-2 pl-4">{ar.academic.linkedTracks}</th>
                  <th className="py-2 pl-4">عرض المادة</th>
                  <th className="py-2">{ar.app.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((c) => {
                  const linked = trackCourses
                    .filter((tc) => tc.course_id === c.id)
                    .map((tc) => tracks.find((t) => t.id === tc.track_id))
                    .filter((t): t is Track => Boolean(t));
                  return (
                    <tr key={c.id}>
                      <td className="py-3 pl-4">
                        <div className="flex items-center gap-2.5 font-semibold">
                          <CourseIcon iconKey={c.icon_key} />
                          <span>{c.name_ar}</span>
                        </div>
                      </td>
                      <td className="py-3 pl-4 text-xs text-slate-600">
                        {linked.length > 0 ? linked.map((t) => t.name_ar).join(' · ') : 'غير مرتبطة بمسار'}
                      </td>
                      <td className="py-3 pl-4">
                        <StatusTag
                          tone={c.is_active ? 'success' : 'neutral'}
                          label={c.is_active ? ar.academic.active : ar.academic.inactive}
                        />
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setManagingCourse(c)}
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            {ar.academic.linkedTracks}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setCourseName(c.name_ar);
                              setCourseIcon(c.icon_key);
                              setCourseActive(c.is_active);
                              setCourseModal(c);
                            }}
                          >
                            {ar.app.edit}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => prepareDelete('course', c.id, c.name_ar)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {!isLoading && !anyError && tab === 'terms' && (
        <Surface className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{ar.academic.tabs.terms}</h2>
            <Button
              size="sm"
              onClick={() => {
                setTermName('');
                setTermAccessEnd('');
                setTermModal('new');
              }}
            >
              <Plus className="h-4 w-4" />
              إضافة ترم
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 pl-4">{ar.academic.termName}</th>
                  <th className="py-2 pl-4">{ar.academic.accessEndsAt}</th>
                  <th className="py-2">{ar.app.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {terms.map((t) => {
                  const hasFuture =
                    Boolean(t.access_ends_at) && new Date(t.access_ends_at ?? '').getTime() > Date.now();
                  return (
                    <tr key={t.id}>
                      <td className="py-3 pl-4 font-semibold">{t.name_ar}</td>
                      <td className="py-3 pl-4 font-mono tabular-nums">
                        {t.access_ends_at ? (
                          <span className="flex items-center gap-2">
                            <span>{formatCairoDate(t.access_ends_at)}</span>
                            <StatusTag
                              tone={hasFuture ? 'success' : 'danger'}
                              label={hasFuture ? 'مستقبلي' : 'منتهي'}
                            />
                          </span>
                        ) : (
                          <StatusTag tone="danger" label="غير محدد (يمنع قبول المدفوعات)" />
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setTermName(t.name_ar);
                              setTermAccessEnd(t.access_ends_at ? t.access_ends_at.slice(0, 10) : '');
                              setTermModal(t);
                            }}
                          >
                            {ar.app.edit}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => prepareDelete('term', t.id, t.name_ar)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {!isLoading && !anyError && tab === 'coverage' && (
        <Surface className="space-y-4">
          <div>
            <h2 className="text-base font-bold">{ar.academic.coverageTitle}</h2>
            <p className="text-xs text-slate-600">{ar.academic.coverageSubtitle}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="p-3">الصف / المسار</th>
                  {courses.map((c) => (
                    <th key={c.id} className="p-3 text-center">
                      {c.name_ar}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tracks.map((tr) => {
                  const st = stages.find((s) => s.id === tr.stage_id);
                  return (
                    <tr key={tr.id}>
                      <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                        {st?.name_ar} — {tr.name_ar}
                      </td>
                      {courses.map((c) => {
                        const isLinked = trackCourses.some(
                          (tc) => tc.track_id === tr.id && tc.course_id === c.id
                        );
                        if (!isLinked) {
                          return (
                            <td key={c.id} className="p-3 text-center text-slate-300">
                              —
                            </td>
                          );
                        }
                        return (
                          <td key={c.id} className="p-3 text-center">
                            <div className="space-y-1">
                              <span className="font-semibold text-g700">✓ مرتبط</span>
                              {terms.map((term) => {
                                const termLessons = allLessons.filter(
                                  (l) => l.course_id === c.id && l.term_id === term.id
                                );
                                const pub = termLessons.filter((l) => l.status === 'published').length;
                                const draft = termLessons.filter((l) => l.status === 'draft').length;
                                return (
                                  <div key={term.id} className="font-mono tabular-nums text-[11px] text-slate-600">
                                    {term.name_ar}: {pub} منشور · {draft} مسودة
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {/* Stage Modal */}
      <ModalShell
        open={Boolean(stageModal)}
        title={stageModal === 'new' ? 'إضافة صف دراسي' : 'تعديل الصف الدراسي'}
        onClose={() => setStageModal(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveStageMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="stage-name" className="mb-1 block text-sm font-medium">
              {ar.academic.stageName}
            </label>
            <input
              id="stage-name"
              required
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setStageModal(null)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={saveStageMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Track Modal */}
      <ModalShell
        open={Boolean(trackModal)}
        title={trackModal === 'new' ? 'إضافة مسار' : 'تعديل المسار'}
        onClose={() => setTrackModal(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveTrackMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="track-stage" className="mb-1 block text-sm font-medium">
              {ar.academic.stageName}
            </label>
            <select
              id="track-stage"
              required
              value={trackStageId}
              onChange={(e) => setTrackStageId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="track-name" className="mb-1 block text-sm font-medium">
              {ar.academic.trackName}
            </label>
            <input
              id="track-name"
              required
              value={trackName}
              onChange={(e) => setTrackName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={trackActive}
              onChange={(e) => setTrackActive(e.target.checked)}
            />
            <span>متاح لاختيار الطلاب عند التسجيل أو التحويل</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTrackModal(null)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={saveTrackMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Course Modal */}
      <ModalShell
        open={Boolean(courseModal)}
        title={courseModal === 'new' ? 'إضافة مادة دراسية' : 'تعديل المادة'}
        onClose={() => setCourseModal(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCourseMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="course-name" className="mb-1 block text-sm font-medium">
              {ar.academic.courseName}
            </label>
            <input
              id="course-name"
              required
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="course-icon" className="mb-1 block text-sm font-medium">
              {ar.academic.courseIcon}
            </label>
            <select
              id="course-icon"
              value={courseIcon}
              onChange={(e) => setCourseIcon(e.target.value as CourseIconKey)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {COURSE_ICON_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={courseActive}
              onChange={(e) => setCourseActive(e.target.checked)}
            />
            <span>علامة تفعيل العرض (لا تخفي الدروس)</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCourseModal(null)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={saveCourseMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Manage Course Tracks Modal */}
      <ModalShell
        open={Boolean(managingCourse)}
        title={`المسارات المرتبطة بمادة: ${managingCourse?.name_ar ?? ''}`}
        onClose={() => setManagingCourse(null)}
      >
        {managingCourse && (
          <div className="space-y-4">
            {trackCourses.filter((tc) => tc.course_id === managingCourse.id).length >= 1 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {ar.academic.sharedCourseWarning}
              </div>
            )}
            <div className="space-y-2">
              {trackCourses
                .filter((tc) => tc.course_id === managingCourse.id)
                .map((tc) => {
                  const tr = tracks.find((t) => t.id === tc.track_id);
                  const st = tr ? stages.find((s) => s.id === tr.stage_id) : undefined;
                  if (!tr) return null;
                  return (
                    <div
                      key={tc.track_id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span>
                        {st?.name_ar} / <span className="font-semibold">{tr.name_ar}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          setUnlinkTarget({
                            trackId: tr.id,
                            courseId: managingCourse.id,
                            trackName: tr.name_ar,
                          })
                        }
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        فك الارتباط
                      </Button>
                    </div>
                  );
                })}
            </div>

            <div className="flex items-end gap-2 border-t border-slate-200 pt-4">
              <div className="flex-1">
                <label htmlFor="link-track-select" className="mb-1 block text-xs font-medium text-slate-600">
                  {ar.academic.linkToTrack}
                </label>
                <select
                  id="link-track-select"
                  value={linkTrackId}
                  onChange={(e) => setLinkTrackId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">اختر مسارًا...</option>
                  {tracks
                    .filter(
                      (tr) =>
                        !trackCourses.some(
                          (tc) => tc.course_id === managingCourse.id && tc.track_id === tr.id
                        )
                    )
                    .map((tr) => {
                      const st = stages.find((s) => s.id === tr.stage_id);
                      return (
                        <option key={tr.id} value={tr.id}>
                          {st?.name_ar} — {tr.name_ar}
                        </option>
                      );
                    })}
                </select>
              </div>
              <Button
                disabled={!linkTrackId}
                loading={linkTrackMut.isPending}
                onClick={() => linkTrackMut.mutate()}
              >
                ربط
              </Button>
            </div>
          </div>
        )}
      </ModalShell>

      {/* Term Modal */}
      <ModalShell
        open={Boolean(termModal)}
        title={termModal === 'new' ? 'إضافة ترم' : 'تعديل الترم'}
        onClose={() => setTermModal(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveTermMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="term-name" className="mb-1 block text-sm font-medium">
              {ar.academic.termName}
            </label>
            <input
              id="term-name"
              required
              value={termName}
              onChange={(e) => setTermName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="term-access-end" className="mb-1 block text-sm font-medium">
              {ar.academic.accessEndsAt}
            </label>
            <input
              id="term-access-end"
              type="date"
              value={termAccessEnd}
              onChange={(e) => setTermAccessEnd(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTermModal(null)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={saveTermMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      {/* Unlink Warning Confirm */}
      <ConfirmDialog
        open={Boolean(unlinkTarget)}
        title="فك ارتباط المادة بالمسار"
        message={ar.academic.unlinkCourseWarning}
        danger
        loading={unlinkTrackMut.isPending}
        onConfirm={() => unlinkTrackMut.mutate()}
        onClose={() => setUnlinkTarget(null)}
      />

      {/* Dependency-Checked Delete Dialog */}
      <ModalShell
        open={Boolean(deleteTarget)}
        title={`حذف: ${deleteTarget?.name ?? ''}`}
        onClose={() => setDeleteTarget(null)}
        maxWidth="max-w-md"
      >
        {deleteTarget && (
          <div className="space-y-4">
            {!deleteTarget.canDelete ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                {ar.academic.deleteBlockedPrefix} {deleteTarget.depsText}
              </div>
            ) : (
              <p className="text-sm text-slate-700">
                هل أنت متأكد من حذف «{deleteTarget.name}»؟ لا توجد سجلات مرتبطة به.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                {ar.app.cancel}
              </Button>
              <Button
                variant="danger"
                disabled={!deleteTarget.canDelete}
                loading={deleteEntityMut.isPending}
                onClick={() => deleteEntityMut.mutate()}
              >
                {ar.app.delete}
              </Button>
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
