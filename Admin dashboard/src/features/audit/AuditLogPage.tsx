import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { AuditLogEntry } from '../../data/types';
import { formatCairoDateTime } from '../../lib/format';
import { exportTableToXlsx } from '../../lib/xlsx';
import { Button, ModalShell, PageHeader, Surface } from '../../components/ui/Primitives';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';

export function AuditLogPage() {
  const [action, setAction] = React.useState('');
  const [entityType, setEntityType] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [selectedEntry, setSelectedEntry] = React.useState<AuditLogEntry | null>(null);

  const filter = {
    action: action || undefined,
    entityType: entityType || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    page,
    pageSize,
  };

  const auditQ = useQuery({
    queryKey: keys.audit.list(filter),
    queryFn: () => api.getAuditLog(filter),
  });

  const rows = auditQ.data?.items ?? [];

  const columns: ColumnDef<AuditLogEntry, unknown>[] = [
    {
      header: 'التاريخ والوقت',
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-slate-600">
          {formatCairoDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      header: ar.audit.actor,
      cell: ({ row }) => <span className="font-medium text-slate-900">{row.original.actor_name}</span>,
    },
    {
      header: ar.audit.action,
      cell: ({ row }) => <span className="font-mono text-xs text-g700">{row.original.action}</span>,
    },
    {
      header: ar.audit.entityType,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-700">
          {row.original.entity_type} ({row.original.entity_id})
        </span>
      ),
    },
    {
      header: ar.audit.details,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setSelectedEntry(row.original)}
          className="text-xs font-medium text-g700 hover:underline cursor-pointer"
        >
          عرض التفاصيل
        </button>
      ),
    },
  ];

  const handleExport = () => {
    exportTableToXlsx(
      'audit-log.xlsx',
      'AuditLog',
      ['الوقت', 'المنفّذ', 'الإجراء', 'نوع الكيان', 'معرف الكيان', 'التفاصيل'],
      rows.map((r) => [
        formatCairoDateTime(r.created_at),
        r.actor_name,
        r.action,
        r.entity_type,
        r.entity_id,
        JSON.stringify(r.details),
      ])
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.audit.title}
        subtitle="سجل غير قابل للتعديل أو الحذف لجميع الإجراءات الإدارية الحساسة"
        actions={
          <Button variant="secondary" disabled={rows.length === 0} onClick={handleExport}>
            <FileSpreadsheet className="h-4 w-4" />
            {ar.app.exportXlsx}
          </Button>
        }
      />

      <Surface className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="text"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          placeholder="تصفية بالإجراء (مثال: approve)..."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          placeholder="نوع الكيان (مثال: lesson / exam)..."
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </Surface>

      <DataTable
        data={rows}
        columns={columns}
        isLoading={auditQ.isLoading}
        error={auditQ.error}
        onRetry={() => auditQ.refetch()}
        page={page}
        pageSize={pageSize}
        total={auditQ.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <ModalShell
        open={Boolean(selectedEntry)}
        title={`تفاصيل السجل: ${selectedEntry?.action ?? ''}`}
        onClose={() => setSelectedEntry(null)}
      >
        {selectedEntry && (
          <div className="space-y-3 text-xs">
            <p>
              <strong>المنفّذ:</strong> {selectedEntry.actor_name}
            </p>
            <p>
              <strong>الكيان:</strong> {selectedEntry.entity_type} / {selectedEntry.entity_id}
            </p>
            <pre
              dir="ltr"
              className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-left text-xs"
            >
              {JSON.stringify(selectedEntry.details, null, 2)}
            </pre>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
