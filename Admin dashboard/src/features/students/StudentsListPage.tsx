import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { StudentOverviewRow } from '../../data/types';
import { formatCairoDate } from '../../lib/format';
import { exportTableToXlsx } from '../../lib/xlsx';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Button, PageHeader, StatusTag, Surface } from '../../components/ui/Primitives';

export function StudentsListPage() {
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [governorateId, setGovernorateId] = React.useState('');
  const [administrationId, setAdministrationId] = React.useState('');
  const [stageId, setStageId] = React.useState('');
  const [trackId, setTrackId] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'trial' | 'subscribed' | 'expired' | 'blocked'>('all');
  const [sortBy, setSortBy] = React.useState<'created_at' | 'full_name' | 'trial_ends_at'>('created_at');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const govsQ = useQuery({ queryKey: keys.academic.governorates, queryFn: () => api.getGovernorates() });
  const adminsQ = useQuery({
    queryKey: keys.academic.administrations(governorateId),
    queryFn: () => api.getAdministrations(governorateId || undefined),
  });
  const stagesQ = useQuery({ queryKey: keys.academic.stages, queryFn: () => api.getStages() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });

  const filterObj = {
    search: debouncedSearch || undefined,
    governorateId: governorateId || undefined,
    administrationId: administrationId || undefined,
    stageId: stageId || undefined,
    trackId: trackId || undefined,
    status,
    sortBy,
    sortDir,
    page,
    pageSize,
  };

  const studentsQ = useQuery({
    queryKey: keys.students.list(filterObj),
    queryFn: () => api.getStudents(filterObj),
  });

  const handleExport = () => {
    const rows = studentsQ.data?.items ?? [];
    exportTableToXlsx(
      'students-export.xlsx',
      'Students',
      ['الاسم', 'الموبايل', 'ولي الأمر', 'المحافظة', 'الإدارة', 'المسار', 'التجربة', 'اشتراكات سارية', 'الحالة'],
      rows.map((s) => [
        s.full_name,
        s.phone,
        s.guardian_phone ?? '',
        s.governorate_name,
        s.administration_name ?? '',
        s.track_name,
        s.trial_days_left > 0 ? `${s.trial_days_left} يوم` : 'منتهية',
        s.active_subscriptions_count,
        s.is_blocked ? 'محظور' : 'نشط',
      ])
    );
  };

  const columns: ColumnDef<StudentOverviewRow, unknown>[] = [
    {
      header: 'الطالب',
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-slate-900">{row.original.full_name}</p>
          <p className="font-mono text-xs tabular-nums text-slate-500">{row.original.phone}</p>
        </div>
      ),
    },
    {
      header: ar.students.guardianPhone,
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-slate-600">
          {row.original.guardian_phone ?? '—'}
        </span>
      ),
    },
    {
      header: 'المحافظة / الإدارة',
      cell: ({ row }) => (
        <span className="text-xs text-slate-700">
          {row.original.governorate_name}
          {row.original.administration_name ? ` · ${row.original.administration_name}` : ''}
        </span>
      ),
    },
    {
      header: ar.students.track,
      cell: ({ row }) => <span className="text-xs font-medium">{row.original.track_name}</span>,
    },
    {
      header: ar.students.trialState,
      cell: ({ row }) =>
        row.original.trial_days_left > 0 ? (
          <StatusTag
            tone="info"
            label={ar.students.trialRemaining.replace('{days}', String(row.original.trial_days_left))}
          />
        ) : (
          <StatusTag tone="neutral" label={ar.students.trialEnded} />
        ),
    },
    {
      header: 'اشتراكات سارية',
      cell: ({ row }) => (
        <span className="font-mono tabular-nums font-semibold">
          {row.original.active_subscriptions_count}
        </span>
      ),
    },
    {
      header: ar.app.status,
      cell: ({ row }) =>
        row.original.is_blocked ? (
          <StatusTag tone="danger" label={ar.students.blocked} />
        ) : (
          <StatusTag tone="success" label={ar.students.activeAccount} />
        ),
    },
    {
      header: ar.app.createdAt,
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-slate-500">
          {formatCairoDate(row.original.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.students.title}
        subtitle="إدارة حسابات الطلاب، الاشتراكات، الجلسات، والمحافظة/المسار"
        actions={
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {ar.app.exportXlsx}
          </Button>
        }
      />

      <Surface className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          placeholder="بحث بالاسم أو رقم الموبايل..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={governorateId}
          onChange={(e) => {
            setGovernorateId(e.target.value);
            setAdministrationId('');
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل المحافظات</option>
          {(govsQ.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.name_ar}
            </option>
          ))}
        </select>
        <select
          value={administrationId}
          disabled={!governorateId}
          onChange={(e) => {
            setAdministrationId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
        >
          <option value="">كل الإدارات</option>
          {(adminsQ.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name_ar}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {Object.entries(ar.students.filterStatusOptions).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={stageId}
          onChange={(e) => {
            setStageId(e.target.value);
            setTrackId('');
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل الصفوف</option>
          {(stagesQ.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name_ar}
            </option>
          ))}
        </select>
        <select
          value={trackId}
          onChange={(e) => {
            setTrackId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل المسارات</option>
          {(tracksQ.data ?? [])
            .filter((t) => !stageId || t.stage_id === stageId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name_ar}
              </option>
            ))}
        </select>
        <select
          value={`${sortBy}:${sortDir}`}
          onChange={(e) => {
            const [sb, sd] = e.target.value.split(':');
            setSortBy(sb as typeof sortBy);
            setSortDir(sd as typeof sortDir);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="created_at:desc">الأحدث تسجيلًا</option>
          <option value="created_at:asc">الأقدم تسجيلًا</option>
          <option value="full_name:asc">الاسم (أ-ي)</option>
          <option value="trial_ends_at:asc">الأقرب انتهاءً للتجربة</option>
        </select>
      </Surface>

      <DataTable
        data={studentsQ.data?.items ?? []}
        columns={columns}
        isLoading={studentsQ.isLoading}
        error={studentsQ.error}
        onRetry={() => studentsQ.refetch()}
        page={page}
        pageSize={pageSize}
        total={studentsQ.data?.total}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
        onRowClick={(row) => navigate(`/students/${row.id}`)}
      />
    </div>
  );
}
