import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  Edit3,
  Eye,
  FileText,
  HelpCircle,
  Link2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { LessonStatus, LessonWithContext } from '../../data/types';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../lib/permissions';
import { formatCairoDate } from '../../lib/format';
import { ConfirmDialog } from '../../components/ui/Dialogs';
import {
  AudienceBanner,
  Button,
  CourseIcon,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';
import { AddLessonModal } from './AddLessonModal';
import { LessonPreviewModal } from './LessonPreviewModal';

export function ContentBrowserPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const roles = useAuthStore((s) => s.session?.roles ?? []);
  const isAdmin = hasPermission(roles, 'reference:write');

  const stagesQ = useQuery({ queryKey: keys.academic.stages, queryFn: () => api.getStages() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });
  const coursesQ = useQuery({ queryKey: keys.academic.courses, queryFn: () => api.getCourses() });
  const trackCoursesQ = useQuery({
    queryKey: keys.academic.trackCourses,
    queryFn: () => api.getTrackCourses(),
  });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });

  // All lessons for tree counts
  const allLessonsForCountsQ = useQuery({
    queryKey: keys.content.treeCounts,
    queryFn: () => api.getLessons({ pageSize: 1000 }),
  });

  const [treeSearch, setTreeSearch] = React.useState('');
  const [selectedStageId, setSelectedStageId] = React.useState<string>('');
  const [selectedTrackId, setSelectedTrackId] = React.useState<string>('');
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>('');
  const [selectedTermId, setSelectedTermId] = React.useState<string>('');
  const [expandedStages, setExpandedStages] = React.useState<Record<string, boolean>>({});
  const [expandedTracks, setExpandedTracks] = React.useState<Record<string, boolean>>({});

  // Global search & filters
  const [statusFilter, setStatusFilter] = React.useState<LessonStatus | 'all'>('all');
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [globalSearchMode, setGlobalSearchMode] = React.useState(false);

  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const [previewLessonId, setPreviewLessonId] = React.useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = React.useState<{
    lesson: LessonWithContext;
    progressCount: number;
  } | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Select default term and first course on initial load
  React.useEffect(() => {
    if (!selectedTermId && termsQ.data?.[0]) {
      setSelectedTermId(termsQ.data[0].id);
    }
  }, [selectedTermId, termsQ.data]);

  React.useEffect(() => {
    if (stagesQ.data && tracksQ.data && trackCoursesQ.data && !selectedCourseId) {
      const st = stagesQ.data[0];
      const tr = tracksQ.data.find((t) => t.stage_id === st?.id);
      const tc = trackCoursesQ.data.find((x) => x.track_id === tr?.id);
      if (st && tr && tc) {
        setExpandedStages({ [st.id]: true });
        setExpandedTracks({ [tr.id]: true });
        setSelectedStageId(st.id);
        setSelectedTrackId(tr.id);
        setSelectedCourseId(tc.course_id);
      }
    }
  }, [selectedCourseId, stagesQ.data, trackCoursesQ.data, tracksQ.data]);

  const workspaceLessonsQ = useQuery({
    queryKey: keys.content.lessons({
      courseId: globalSearchMode ? undefined : selectedCourseId,
      termId: globalSearchMode ? undefined : selectedTermId,
      status: statusFilter,
      search: debouncedSearch,
    }),
    queryFn: () =>
      api.getLessons({
        courseId: globalSearchMode ? undefined : selectedCourseId || undefined,
        termId: globalSearchMode ? undefined : selectedTermId || undefined,
        status: statusFilter,
        search: debouncedSearch || undefined,
        pageSize: 100,
      }),
    enabled: globalSearchMode || (Boolean(selectedCourseId) && Boolean(selectedTermId)),
  });

  const previewDetailQ = useQuery({
    queryKey: keys.content.lessonDetail(previewLessonId ?? 'none'),
    queryFn: () => api.getLessonDetail(previewLessonId ?? ''),
    enabled: Boolean(previewLessonId),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LessonStatus }) =>
      api.setLessonStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.content.all });
      notify.success('تم تحديث حالة الدرس');
    },
    onError: (e) => notify.error(e),
  });

  const reorderMut = useMutation({
    mutationFn: (
      rows: Array<{ id: string; course_id: string; term_id: string; title: string; sort_order: number }>
    ) => api.reorderLessons(rows),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.content.all });
      notify.success('تم حفظ ترتيب الدروس');
    },
    onError: (e) => {
      void queryClient.invalidateQueries({ queryKey: keys.content.all });
      notify.error(e);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteLesson(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.content.all });
      setDeleteDialog(null);
      notify.success('تم حذف الدرس');
    },
    onError: (e) => notify.error(e),
  });

  const stages = stagesQ.data ?? [];
  const tracks = tracksQ.data ?? [];
  const courses = coursesQ.data ?? [];
  const trackCourses = trackCoursesQ.data ?? [];
  const terms = termsQ.data ?? [];
  const allLessonsForCounts = allLessonsForCountsQ.data?.items ?? [];
  const workspaceLessons = workspaceLessonsQ.data?.items ?? [];

  const selectedStage = stages.find((s) => s.id === selectedStageId);
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const selectedTerm = terms.find((t) => t.id === selectedTermId);

  const courseAudienceTracks = trackCourses
    .filter((tc) => tc.course_id === selectedCourseId)
    .map((tc) => {
      const tr = tracks.find((t) => t.id === tc.track_id);
      const st = tr ? stages.find((s) => s.id === tr.stage_id) : undefined;
      return tr && st ? { trackName: tr.name_ar, stageName: st.name_ar } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const moveLesson = (idx: number, dir: -1 | 1) => {
    const next = [...workspaceLessons];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    const a = next[idx];
    const b = next[swap];
    if (!a || !b) return;
    next[idx] = b;
    next[swap] = a;
    reorderMut.mutate(
      next.map((l, i) => ({
        id: l.id,
        course_id: l.course_id,
        term_id: l.term_id,
        title: l.title,
        sort_order: i + 1,
      }))
    );
  };

  const askDeleteLesson = async (lesson: LessonWithContext) => {
    try {
      const impact = await api.getLessonDeleteImpact(lesson.id);
      setDeleteDialog({ lesson, progressCount: impact.progressCount });
    } catch {
      setDeleteDialog({ lesson, progressCount: 0 });
    }
  };

  if (stagesQ.isLoading || tracksQ.isLoading || coursesQ.isLoading) {
    return (
      <div>
        <PageHeader title={ar.content.title} />
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (stagesQ.error || tracksQ.error || coursesQ.error) {
    return (
      <div>
        <PageHeader title={ar.content.title} />
        <ErrorState error={stagesQ.error || tracksQ.error || coursesQ.error} />
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div>
        <PageHeader title={ar.content.title} />
        <EmptyState
          title={ar.content.noStagesEmpty}
          action={
            isAdmin ? (
              <Link to="/academic" className="rounded-lg bg-g700 px-4 py-2 text-sm font-medium text-white">
                {ar.nav.academic}
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.content.title}
        subtitle="إدارة الدروس وعناصرها (مقالات، روابط، أسئلة سريعة) على مستوى المادة والترم"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={globalSearchMode ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setGlobalSearchMode((v) => !v)}
            >
              <Search className="h-4 w-4" />
              {globalSearchMode ? 'العودة للشجرة' : 'بحث شامل في الدروس'}
            </Button>
            <Button onClick={() => setAddModalOpen(true)}>
              <Plus className="h-4 w-4" />
              {ar.content.addLesson}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Curriculum Tree */}
        {!globalSearchMode && (
          <Surface className="lg:col-span-3 space-y-3 self-start">
            <input
              type="search"
              placeholder={ar.content.treeSearchPlaceholder}
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="space-y-2">
              {stages.map((st) => {
                const stTracks = tracks.filter((t) => t.stage_id === st.id);
                const q = treeSearch.trim().toLowerCase();
                const stageMatches = !q || st.name_ar.toLowerCase().includes(q);
                const stOpen = expandedStages[st.id] ?? true;

                return (
                  <div key={st.id} className="rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedStages((p) => ({ ...p, [st.id]: !stOpen }))
                      }
                      className="flex w-full items-center justify-between px-3 py-2 text-right text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      <span>{st.name_ar}</span>
                      {stOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </button>

                    {stOpen && (
                      <div className="space-y-1 border-t border-slate-100 p-2">
                        {stTracks.map((tr) => {
                          const trCourses = trackCourses
                            .filter((tc) => tc.track_id === tr.id)
                            .map((tc) => courses.find((c) => c.id === tc.course_id))
                            .filter((c): c is NonNullable<typeof c> => Boolean(c))
                            .filter(
                              (c) =>
                                stageMatches ||
                                tr.name_ar.toLowerCase().includes(q) ||
                                c.name_ar.toLowerCase().includes(q)
                            );
                          if (q && trCourses.length === 0 && !tr.name_ar.toLowerCase().includes(q)) {
                            return null;
                          }
                          const trOpen = expandedTracks[tr.id] ?? true;

                          return (
                            <div key={tr.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedTracks((p) => ({ ...p, [tr.id]: !trOpen }))
                                }
                                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-right text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                <span>
                                  {tr.name_ar} {!tr.is_active ? '(غير نشط)' : ''}
                                </span>
                                {trOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronLeft className="h-3.5 w-3.5" />
                                )}
                              </button>
                              {trOpen && (
                                <div className="mt-1 space-y-1 pr-3">
                                  {trCourses.map((c) => {
                                    const active =
                                      selectedCourseId === c.id && selectedTrackId === tr.id;
                                    const courseLessons = allLessonsForCounts.filter(
                                      (l) => l.course_id === c.id
                                    );
                                    const pubCount = courseLessons.filter(
                                      (l) => l.status === 'published'
                                    ).length;
                                    const draftCount = courseLessons.filter(
                                      (l) => l.status === 'draft'
                                    ).length;

                                    return (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedStageId(st.id);
                                          setSelectedTrackId(tr.id);
                                          setSelectedCourseId(c.id);
                                        }}
                                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-right text-xs transition-colors cursor-pointer ${
                                          active
                                            ? 'bg-g50 font-semibold text-g800 border border-g700/30'
                                            : 'text-slate-700 hover:bg-slate-100'
                                        }`}
                                      >
                                        <span className="flex items-center gap-2">
                                          <CourseIcon iconKey={c.icon_key} className="h-3.5 w-3.5 text-g700" />
                                          <span>{c.name_ar}</span>
                                        </span>
                                        <span className="font-mono tabular-nums text-[11px] text-slate-500">
                                          {pubCount} / {draftCount}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Surface>
        )}

        {/* Workspace */}
        <div className={globalSearchMode ? 'lg:col-span-12 space-y-4' : 'lg:col-span-9 space-y-4'}>
          {!globalSearchMode && selectedCourse && (
            <>
              <Surface className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-600">
                    {selectedStage?.name_ar} › {selectedTrack?.name_ar} ›{' '}
                    <span className="font-bold text-slate-900">{selectedCourse.name_ar}</span> ›{' '}
                    <span>{selectedTerm?.name_ar}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                    {terms.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTermId(t.id)}
                        className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer ${
                          selectedTermId === t.id
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t.name_ar}
                      </button>
                    ))}
                  </div>
                </div>
                <AudienceBanner tracks={courseAudienceTracks} />
              </Surface>
            </>
          )}

          {/* Filters */}
          <Surface className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              placeholder={ar.content.globalSearchPlaceholder}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LessonStatus | 'all')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">كل الحالات</option>
              <option value="published">{ar.content.lessonStatus.published}</option>
              <option value="draft">{ar.content.lessonStatus.draft}</option>
              <option value="archived">{ar.content.lessonStatus.archived}</option>
            </select>
          </Surface>

          {workspaceLessonsQ.isLoading ? (
            <SkeletonRows rows={5} />
          ) : workspaceLessonsQ.error ? (
            <ErrorState error={workspaceLessonsQ.error} onRetry={() => workspaceLessonsQ.refetch()} />
          ) : workspaceLessons.length === 0 ? (
            <EmptyState
              title={ar.content.noLessonsEmpty}
              action={
                <Button onClick={() => setAddModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {ar.content.addFirstLesson}
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-right text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="px-3 py-3">#</th>
                      <th className="px-3 py-3">الدرس</th>
                      {globalSearchMode && <th className="px-3 py-3">المادة / الترم</th>}
                      <th className="px-3 py-3">{ar.app.status}</th>
                      <th className="px-3 py-3">العناصر</th>
                      <th className="px-3 py-3">{ar.app.updatedAt}</th>
                      <th className="px-3 py-3">{ar.app.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workspaceLessons.map((les, idx) => (
                      <tr key={les.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3 font-mono tabular-nums text-xs text-slate-500">
                          {les.sort_order}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            to={`/content/lessons/${les.id}`}
                            className="font-semibold text-slate-900 hover:text-g700 hover:underline"
                          >
                            {les.title}
                          </Link>
                          {les.summary && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{les.summary}</p>
                          )}
                        </td>
                        {globalSearchMode && (
                          <td className="px-3 py-3 text-xs text-slate-600">
                            {les.course_name} · {les.term_name}
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <StatusTag
                            tone={
                              les.status === 'published'
                                ? 'success'
                                : les.status === 'draft'
                                ? 'warning'
                                : 'neutral'
                            }
                            label={ar.content.lessonStatus[les.status]}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
                            <span>{les.items_count}</span>
                            {les.item_types.includes('article') && <FileText className="h-3.5 w-3.5" />}
                            {les.item_types.includes('link') && <Link2 className="h-3.5 w-3.5" />}
                            {les.item_types.includes('quick_questions') && (
                              <HelpCircle className="h-3.5 w-3.5" />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {formatCairoDate(les.updated_at)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => navigate(`/content/lessons/${les.id}`)}
                              aria-label={`تعديل ${les.title}`}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              {ar.app.edit}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPreviewLessonId(les.id)}
                              aria-label={`معاينة ${les.title}`}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {les.status === 'draft' ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => statusMut.mutate({ id: les.id, status: 'published' })}
                              >
                                نشر
                              </Button>
                            ) : les.status === 'published' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => statusMut.mutate({ id: les.id, status: 'draft' })}
                              >
                                إلغاء النشر
                              </Button>
                            ) : null}
                            {les.status !== 'archived' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => statusMut.mutate({ id: les.id, status: 'archived' })}
                                aria-label={`أرشفة ${les.title}`}
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {!globalSearchMode && !debouncedSearch && statusFilter === 'all' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={idx === 0 || reorderMut.isPending}
                                  onClick={() => moveLesson(idx, -1)}
                                  aria-label={`تحريك ${les.title} لأعلى`}
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={idx === workspaceLessons.length - 1 || reorderMut.isPending}
                                  onClick={() => moveLesson(idx, 1)}
                                  aria-label={`تحريك ${les.title} لأسفل`}
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => askDeleteLesson(les)}
                              aria-label={`حذف ${les.title}`}
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
            </div>
          )}
        </div>
      </div>

      <AddLessonModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        initialStageId={selectedStageId}
        initialTrackId={selectedTrackId}
        initialCourseId={selectedCourseId}
        initialTermId={selectedTermId}
      />

      {previewDetailQ.data && (
        <LessonPreviewModal
          open={Boolean(previewLessonId)}
          onClose={() => setPreviewLessonId(null)}
          lesson={previewDetailQ.data.lesson}
          items={previewDetailQ.data.items}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteDialog)}
        title={`حذف الدرس: ${deleteDialog?.lesson.title ?? ''}`}
        message={
          deleteDialog && deleteDialog.lesson.status === 'published' && deleteDialog.progressCount > 0
            ? ar.content.deleteLessonSuggestArchive.replace(
                '{count}',
                String(deleteDialog.progressCount)
              )
            : 'هل أنت متأكد من حذف هذا الدرس؟ سيتم حذف جميع عناصره وأسئلته السريعة وتقدم الطلاب المرتبط به.'
        }
        danger
        loading={deleteMut.isPending}
        onConfirm={() => deleteDialog && deleteMut.mutate(deleteDialog.lesson.id)}
        onClose={() => setDeleteDialog(null)}
      >
        {deleteDialog && deleteDialog.lesson.status === 'published' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              statusMut.mutate({ id: deleteDialog.lesson.id, status: 'archived' });
              setDeleteDialog(null);
            }}
          >
            أرشفة الدرس بدلًا من الحذف
          </Button>
        )}
      </ConfirmDialog>
    </div>
  );
}
