import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, BarChart2, Edit3, Plus } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../lib/permissions';
import { formatCairoDate } from '../../lib/format';
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';

export function ExamsListPage() {
  const navigate = useNavigate();
  const roles = useAuthStore((s) => s.session?.roles ?? []);
  const canWrite = hasPermission(roles, 'exams:write');

  const [statusFilter, setStatusFilter] = React.useState('all');

  const examsQ = useQuery({
    queryKey: keys.exams.list({ status: statusFilter }),
    queryFn: () => api.getExams({ status: statusFilter }),
  });
  const coursesQ = useQuery({ queryKey: keys.academic.courses, queryFn: () => api.getCourses() });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });

  const exams = examsQ.data ?? [];
  const courses = coursesQ.data ?? [];
  const terms = termsQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.exams.title}
        subtitle="بناء الامتحانات المركزية، جدولة الجلسات والجمهور، المراقبة المباشرة وإحصائيات الأسئلة"
        actions={
          canWrite && (
            <Button onClick={() => navigate('/exams/new')}>
              <Plus className="h-4 w-4" />
              {ar.exams.newExam}
            </Button>
          )
        }
      />

      <Surface className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">كل الحالات</option>
          <option value="draft">{ar.content.lessonStatus.draft}</option>
          <option value="published">{ar.content.lessonStatus.published}</option>
          <option value="archived">{ar.content.lessonStatus.archived}</option>
        </select>
      </Surface>

      {examsQ.isLoading ? (
        <SkeletonRows rows={5} />
      ) : examsQ.error ? (
        <ErrorState error={examsQ.error} onRetry={() => examsQ.refetch()} />
      ) : exams.length === 0 ? (
        <EmptyState
          title="لا توجد امتحانات بعد"
          action={
            canWrite ? (
              <Button onClick={() => navigate('/exams/new')}>{ar.exams.newExam}</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">عنوان الامتحان</th>
                  <th className="px-4 py-3">المادة / الترم</th>
                  <th className="px-4 py-3">المدة</th>
                  <th className="px-4 py-3">{ar.app.status}</th>
                  <th className="px-4 py-3">{ar.app.createdAt}</th>
                  <th className="px-4 py-3">{ar.app.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exams.map((ex) => {
                  const course = courses.find((c) => c.id === ex.course_id);
                  const term = terms.find((t) => t.id === ex.term_id);
                  return (
                    <tr key={ex.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{ex.title}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {course?.name_ar ?? '—'} · {term?.name_ar ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-xs">
                        {ex.duration_minutes} دقيقة
                      </td>
                      <td className="px-4 py-3">
                        <StatusTag
                          tone={
                            ex.status === 'published'
                              ? 'success'
                              : ex.status === 'draft'
                              ? 'warning'
                              : 'neutral'
                          }
                          label={ar.content.lessonStatus[ex.status]}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-500">
                        {formatCairoDate(ex.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/exams/${ex.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            البناء والإعداد
                          </Link>
                          <Link
                            to={`/exams/${ex.id}/monitor`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Activity className="h-3.5 w-3.5" />
                            المراقبة
                          </Link>
                          <Link
                            to={`/exams/${ex.id}/stats`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <BarChart2 className="h-3.5 w-3.5" />
                            الإحصائيات
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
