import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { formatCairoDateTime } from '../../lib/format';
import {
  Button,
  ErrorState,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';

export function ExamDetailPage({ mode }: { mode: 'monitor' | 'stats' }) {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const detailQ = useQuery({
    queryKey: keys.exams.detail(id),
    queryFn: () => api.getExamDetail(id),
    enabled: Boolean(id),
  });

  const monitorQ = useQuery({
    queryKey: keys.exams.monitoring(id),
    queryFn: () => api.getExamMonitoring(id),
    enabled: Boolean(id) && mode === 'monitor',
    refetchInterval: 15_000,
  });

  const statsQ = useQuery({
    queryKey: keys.exams.stats(id),
    queryFn: () => api.getQuestionStats(id),
    enabled: Boolean(id) && mode === 'stats',
  });

  if (detailQ.isLoading) {
    return (
      <div>
        <PageHeader title={ar.exams.title} />
        <SkeletonRows rows={5} />
      </div>
    );
  }

  if (detailQ.error || !detailQ.data) {
    return (
      <div>
        <PageHeader title={ar.exams.title} />
        <ErrorState error={detailQ.error} onRetry={() => detailQ.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${detailQ.data.exam.title} — ${mode === 'monitor' ? ar.exams.monitoringTab : ar.exams.statsTab}`}
        subtitle={mode === 'monitor' ? ar.exams.autoRefreshNote : 'تحليل أداء الأسئلة ونسبة الإجابات الصحيحة'}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/exams')}>
            <ArrowRight className="h-4 w-4" />
            العودة للامتحانات
          </Button>
        }
      />

      {mode === 'monitor' && (
        <Surface>
          {monitorQ.isLoading ? (
            <SkeletonRows rows={4} />
          ) : monitorQ.error ? (
            <ErrorState error={monitorQ.error} onRetry={() => monitorQ.refetch()} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pl-4">الجلسة</th>
                    <th className="py-2 pl-4">الوقت</th>
                    <th className="py-2 pl-4">المؤهلون</th>
                    <th className="py-2 pl-4">إجمالي المحاولات</th>
                    <th className="py-2 pl-4">نسبة المشاركة</th>
                    <th className="py-2 pl-4">جاري الحل</th>
                    <th className="py-2 pl-4">تم التسليم</th>
                    <th className="py-2">تسليم تلقائي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(monitorQ.data ?? []).map((row) => {
                    const pct =
                      row.eligible_count > 0
                        ? Math.round((row.total_attempts / row.eligible_count) * 100)
                        : 0;
                    return (
                      <tr key={row.session_id}>
                        <td className="py-3 pl-4 font-semibold">{row.session_name}</td>
                        <td className="py-3 pl-4 font-mono text-xs tabular-nums">
                          {formatCairoDateTime(row.starts_at)}
                        </td>
                        <td className="py-3 pl-4 font-mono tabular-nums">{row.eligible_count}</td>
                        <td className="py-3 pl-4 font-mono tabular-nums">{row.total_attempts}</td>
                        <td className="py-3 pl-4 font-mono tabular-nums font-bold text-g700">{pct}%</td>
                        <td className="py-3 pl-4 font-mono tabular-nums">{row.in_progress_count}</td>
                        <td className="py-3 pl-4 font-mono tabular-nums">{row.submitted_count}</td>
                        <td className="py-3 font-mono tabular-nums">{row.auto_submitted_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      )}

      {mode === 'stats' && (
        <Surface>
          {statsQ.isLoading ? (
            <SkeletonRows rows={4} />
          ) : statsQ.error ? (
            <ErrorState error={statsQ.error} onRetry={() => statsQ.refetch()} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-2 pl-4">#</th>
                    <th className="py-2 pl-4">السؤال</th>
                    <th className="py-2 pl-4">النوع</th>
                    <th className="py-2 pl-4">الدرجة</th>
                    <th className="py-2 pl-4">عدد الإجابات</th>
                    <th className="py-2">النسبة / المتوسط</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(statsQ.data ?? []).map((q) => {
                    const isHard = q.correct_pct !== null && q.correct_pct < 20;
                    const isTooEasy = q.correct_pct !== null && q.correct_pct > 95;
                    return (
                      <tr key={q.question_id}>
                        <td className="py-3 pl-4 font-mono tabular-nums">{q.position}</td>
                        <td className="py-3 pl-4 text-xs">
                          {q.prompt_html.replace(/<[^>]+>/g, '')}
                        </td>
                        <td className="py-3 pl-4 text-xs">{ar.exams.questionTypes[q.question_type]}</td>
                        <td className="py-3 pl-4 font-mono tabular-nums">{q.points}</td>
                        <td className="py-3 pl-4 font-mono tabular-nums">{q.answered_count}</td>
                        <td className="py-3">
                          {q.question_type === 'mcq' ? (
                            <div className="flex items-center gap-2 font-mono tabular-nums">
                              <span>{q.correct_pct ?? 0}%</span>
                              {isHard && <StatusTag tone="danger" label="صعب جدًا (<20%)" />}
                              {isTooEasy && <StatusTag tone="warning" label="سهل جدًا (>95%)" />}
                            </div>
                          ) : (
                            <span className="font-mono tabular-nums">
                              متوسط: {q.avg_essay_score ?? '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
