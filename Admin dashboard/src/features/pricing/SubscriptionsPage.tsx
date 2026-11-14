import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { Subscription, SubscriptionStatus } from '../../data/types';
import { formatCairoDate, formatEgp } from '../../lib/format';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { PageHeader, StatusTag, Surface } from '../../components/ui/Primitives';

export function SubscriptionsPage() {
  const [status, setStatus] = React.useState<SubscriptionStatus | 'all'>('all');
  const [termId, setTermId] = React.useState('');
  const [trackId, setTrackId] = React.useState('');
  const [stageId, setStageId] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const stagesQ = useQuery({ queryKey: keys.academic.stages, queryFn: () => api.getStages() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });

  const filterObj = {
    status,
    termId: termId || undefined,
    trackId: trackId || undefined,
    stageId: stageId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    search: debouncedSearch || undefined,
    page,
    pageSize,
  };

  const subsQ = useQuery({
    queryKey: keys.pricing.subscriptions(filterObj),
    queryFn: () => api.getSubscriptions(filterObj),
  });

  const columns: ColumnDef<Subscription, unknown>[] = [
    {
      header: 'الطالب',
      cell: ({ row }) => (
        <Link to={`/students/${row.original.student_id}`} className="font-semibold text-g700 hover:underline">
          {row.original.student_name ?? row.original.student_id}
        </Link>
      ),
    },
    {
      header: 'المسار / الترم',
      cell: ({ row }) => (
        <span className="text-xs text-slate-700">
          {row.original.track_name} · {row.original.term_name}
        </span>
      ),
    },
    {
      header: 'المبلغ المدفوع',
      cell: ({ row }) => <span className="font-mono tabular-nums">{formatEgp(row.original.price_paid_egp)}</span>,
    },
    {
      header: 'يبدأ في',
      cell: ({ row }) => <span className="font-mono tabular-nums text-xs">{formatCairoDate(row.original.starts_at)}</span>,
    },
    {
      header: 'ينتهي في',
      cell: ({ row }) => <span className="font-mono tabular-nums text-xs">{formatCairoDate(row.original.ends_at)}</span>,
    },
    {
      header: ar.app.status,
      cell: ({ row }) => {
        const s = row.original.status;
        const tone = s === 'active' ? 'success' : s === 'expired' ? 'warning' : 'neutral';
        return <StatusTag tone={tone} label={ar.pricing.subscriptionStatuses[s]} />;
      },
    },
    {
      header: 'المصدر',
      cell: ({ row }) => (
        <span className="text-xs text-slate-600">
          {row.original.payment_request_id
            ? ar.pricing.sourcePayment
            : `${ar.pricing.sourceManual}${row.original.grant_note ? ` (${row.original.grant_note})` : ''}`}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={ar.pricing.subscriptionsTitle} subtitle={ar.pricing.coreRuleNote} />

      <Surface className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <input
          type="search"
          placeholder="بحث باسم الطالب أو رقمه..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as SubscriptionStatus | 'all');
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="all">كل الحالات</option>
          <option value="active">{ar.pricing.subscriptionStatuses.active}</option>
          <option value="expired">{ar.pricing.subscriptionStatuses.expired}</option>
          <option value="cancelled">{ar.pricing.subscriptionStatuses.cancelled}</option>
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
          value={termId}
          onChange={(e) => {
            setTermId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل الترمات</option>
          {(termsQ.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name_ar}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <input
            type="date"
            aria-label="من تاريخ"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs"
          />
          <input
            type="date"
            aria-label="إلى تاريخ"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-xs"
          />
        </div>
      </Surface>

      <DataTable
        data={subsQ.data?.items ?? []}
        columns={columns}
        isLoading={subsQ.isLoading}
        error={subsQ.error}
        onRetry={() => subsQ.refetch()}
        page={page}
        pageSize={pageSize}
        total={subsQ.data?.total}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
      />
    </div>
  );
}
