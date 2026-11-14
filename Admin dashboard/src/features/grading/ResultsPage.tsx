import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileSpreadsheet } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { ExamResultRow } from '../../data/types';
import { formatCairoDateTime } from '../../lib/format';
import { exportTableToXlsx } from '../../lib/xlsx';
import { Button, PageHeader, StatusTag, Surface } from '../../components/ui/Primitives';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { SimpleBarChart } from '../../components/ui/SimpleCharts';

export function ResultsPage() {
  const examsQ = useQuery({
    queryKey: keys.exams.list({ status: 'published' }),
    queryFn: () => api.getExams({ status: 'published' }),
  });
  const exams = examsQ.data ?? [];
  const [selectedExamId, setSelectedExamId] = React.useState('');

  React.useEffect(() => {
    if (!selectedExamId && exams.length > 0) {
      const preferred = exams.find((e) => e.id === 'exam-2') ?? exams[0];
      if (preferred) setSelectedExamId(preferred.id);
    }
  }, [exams, selectedExamId]);

  const resultsQ = useQuery({
    queryKey: keys.grading.results(selectedExamId),
    queryFn: () => api.getExamResults(selectedExamId),
    enabled: Boolean(selectedExamId),
  });

  const results = resultsQ.data ?? [];

  const distribution = React.useMemo(() => {
    const buckets = [
      { label: 'أقل من 50%', value: 0 },
      { label: '50% - 64%', value: 0 },
      { label: '65% - 79%', value: 0 },
      { label: '80% - 89%', value: 0 },
      { label: '90% - 100%', value: 0 },
    ];
    for (const r of results) {
      if (r.percentage < 50) buckets[0]!.value += 1;
      else if (r.percentage < 65) buckets[1]!.value += 1;
      else if (r.percentage < 80) buckets[2]!.value += 1;
      else if (r.percentage < 90) buckets[3]!.value += 1;
      else buckets[4]!.value += 1;
    }
    return buckets;
  }, [results]);

  const columns: ColumnDef<ExamResultRow, unknown>[] = [
    {
      header: 'الطالب',
      cell: ({ row }) => (
        <Link
          to={`/students/${row.original.student_id}`}
          className="font-semibold text-g700 hover:underline"
        >
          {row.original.student_name ?? row.original.student_id}
        </Link>
      ),
    },
    {
      header: ar.students.phone,
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">{row.original.student_phone ?? '—'}</span>
      ),
    },
    {
      header: 'درجة الاختياري',
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.mcq_score}</span>,
    },
    {
      header: 'درجة المقالي',
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.essay_score}</span>,
    },
    {
      header: 'المجموع',
      cell: ({ row }) => (
        <span className="font-mono font-bold tabular-nums">
          {row.original.total_score} / {row.original.max_score}
        </span>
      ),
    },
    {
      header: 'النسبة المئوية',
      cell: ({ row }) => (
        <StatusTag
          tone={row.original.percentage >= 50 ? 'success' : 'danger'}
          label={`${row.original.percentage}%`}
        />
      ),
    },
    {
      header: 'الاعتماد',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-slate-600">
          {formatCairoDateTime(row.original.approved_at)}
        </span>
      ),
    },
  ];

  const handleExport = () => {
    exportTableToXlsx(
      `exam-results-${selectedExamId}.xlsx`,
      'Results',
      ['الطالب', 'الموبايل', 'الاختياري', 'المقالي', 'المجموع', 'الدرجة النهائية', 'النسبة %', 'تاريخ الاعتماد'],
      results.map((r) => [
        r.student_name ?? r.student_id,
        r.student_phone ?? '',
        r.mcq_score,
        r.essay_score,
        r.total_score,
        r.max_score,
        r.percentage,
        formatCairoDateTime(r.approved_at),
      ])
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.grading.resultsTitle}
        subtitle="استعراض وتصدير نتائج الامتحانات المعتمدة وتوزيع الدرجات"
        actions={
          <Button variant="secondary" disabled={results.length === 0} onClick={handleExport}>
            <FileSpreadsheet className="h-4 w-4" />
            {ar.app.exportXlsx}
          </Button>
        }
      />

      <Surface className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-slate-700">
          اختر الامتحان:
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="mr-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
        </label>
      </Surface>

      {results.length > 0 && (
        <SimpleBarChart title="توزيع الدرجات" data={distribution} unit="طالب" />
      )}

      <DataTable
        data={results}
        columns={columns}
        isLoading={resultsQ.isLoading}
        error={resultsQ.error}
        onRetry={() => resultsQ.refetch()}
        emptyTitle="لا توجد نتائج معتمدة لهذا الامتحان بعد"
      />
    </div>
  );
}
