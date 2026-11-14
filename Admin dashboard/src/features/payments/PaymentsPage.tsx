import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { PaymentQueueRow, PaymentStatus } from '../../data/types';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { formatCairoDate, formatCairoDateTime, formatEgp } from '../../lib/format';
import { exportTableToXlsx } from '../../lib/xlsx';
import { ConfirmDialog, Drawer } from '../../components/ui/Dialogs';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import {
  Button,
  CopyButton,
  PageHeader,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';

export function PaymentsPage() {
  const notify = useNotify();
  const [statusTab, setStatusTab] = React.useState<PaymentStatus>('pending');
  const [termId, setTermId] = React.useState('');
  const [trackId, setTrackId] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);

  const [selectedRow, setSelectedRow] = React.useState<PaymentQueueRow | null>(null);
  const [endsAtOverride, setEndsAtOverride] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');
  const [confirmAction, setConfirmAction] = React.useState<'approve' | 'reject' | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });

  const filterObj = {
    status: statusTab,
    termId: termId || undefined,
    trackId: trackId || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    search: debouncedSearch || undefined,
    page,
    pageSize,
  };

  const queueQ = useQuery({
    queryKey: keys.payments.queue(filterObj),
    queryFn: () => api.getPaymentQueue(filterObj),
  });

  const proofUrlQ = useQuery({
    queryKey: ['payments', 'proof', selectedRow?.proof_path],
    queryFn: () => api.getPaymentProofSignedUrl(selectedRow?.proof_path ?? ''),
    enabled: Boolean(selectedRow?.proof_path),
  });

  const approveMut = useMutation({
    mutationFn: () => {
      if (!selectedRow) throw new Error('missing');
      return api.approvePayment(selectedRow.id, endsAtOverride || null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['pricing', 'subscriptions'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard.summary });
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      setConfirmAction(null);
      setSelectedRow(null);
      notify.success('تم قبول الدفع وتفعيل اشتراك الطالب');
    },
    onError: (e) => {
      setConfirmAction(null);
      notify.error(e);
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => {
      if (!selectedRow) throw new Error('missing');
      return api.rejectPayment(selectedRow.id, rejectReason);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard.summary });
      setConfirmAction(null);
      setSelectedRow(null);
      setRejectReason('');
      notify.success('تم رفض طلب الدفع وإخطار الطالب');
    },
    onError: (e) => {
      setConfirmAction(null);
      notify.error(e);
    },
  });

  const openDrawer = (row: PaymentQueueRow) => {
    setSelectedRow(row);
    setEndsAtOverride(row.term_access_ends_at ? row.term_access_ends_at.slice(0, 10) : '');
    setRejectReason('');
    setZoom(1);
    setRotation(0);
  };

  const handleExport = () => {
    const items = queueQ.data?.items ?? [];
    exportTableToXlsx(
      `payments-${statusTab}.xlsx`,
      'Payments',
      ['تاريخ الطلب', 'الطالب', 'موبايل الطالب', 'المسار', 'الترم', 'المبلغ', 'رقم المحوّل', 'الحالة', 'المراجع', 'سبب الرفض'],
      items.map((r) => [
        formatCairoDateTime(r.created_at),
        r.student_name,
        r.student_phone,
        r.track_name,
        r.term_name,
        r.amount_egp,
        r.sender_phone,
        ar.payments.tabs[r.status],
        r.reviewer_name ?? '',
        r.reject_reason ?? '',
      ])
    );
  };

  const columns: ColumnDef<PaymentQueueRow, unknown>[] = [
    {
      header: ar.app.createdAt,
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-slate-600">
          {formatCairoDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      header: 'الطالب',
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-slate-900">{row.original.student_name}</p>
          <p className="font-mono text-xs tabular-nums text-slate-500">{row.original.student_phone}</p>
        </div>
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
      header: ar.payments.expectedAmount,
      cell: ({ row }) => (
        <span className="font-mono font-bold tabular-nums text-g700">
          {formatEgp(row.original.amount_egp)}
        </span>
      ),
    },
    {
      header: ar.payments.senderPhone,
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums">{row.original.sender_phone}</span>
      ),
    },
    {
      header: 'الإيصال',
      cell: ({ row }) => (
        <span className="text-xs text-slate-600">
          {row.original.proof_path ? 'مرفق' : ar.payments.noProofImage}
        </span>
      ),
    },
    {
      header: ar.app.status,
      cell: ({ row }) => {
        const s = row.original.status;
        const tone = s === 'approved' ? 'success' : s === 'rejected' ? 'danger' : 'warning';
        return <StatusTag tone={tone} label={ar.payments.tabs[s]} />;
      },
    },
    {
      header: ar.app.actions,
      cell: ({ row }) => (
        <Button size="sm" variant="secondary" onClick={() => openDrawer(row.original)}>
          مراجعة
        </Button>
      ),
    },
  ];

  const termsMissingEnd = (termsQ.data ?? []).filter(
    (t) => !t.access_ends_at || new Date(t.access_ends_at).getTime() <= Date.now()
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.payments.title}
        subtitle="طابور مراجعة طلبات الدفع — مرتب من الأقدم للأحدث في المعلّق"
        actions={
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            {ar.app.exportXlsx}
          </Button>
        }
      />

      {termsMissingEnd.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-medium text-red-900">
          {ar.dashboard.missingTermEndBanner} ({termsMissingEnd.map((t) => t.name_ar).join(' · ')})
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {(['pending', 'approved', 'rejected'] as PaymentStatus[]).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => {
              setStatusTab(st);
              setPage(1);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              statusTab === st ? 'bg-g700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {ar.payments.tabs[st]}
          </button>
        ))}
      </div>

      <Surface className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          placeholder="بحث باسم الطالب أو الموبايل أو رقم المحوّل..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
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
        <select
          value={trackId}
          onChange={(e) => {
            setTrackId(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">كل المسارات</option>
          {(tracksQ.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name_ar}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="من تاريخ"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          aria-label="إلى تاريخ"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </Surface>

      <DataTable
        data={queueQ.data?.items ?? []}
        columns={columns}
        isLoading={queueQ.isLoading}
        error={queueQ.error}
        onRetry={() => queueQ.refetch()}
        page={page}
        pageSize={pageSize}
        total={queueQ.data?.total}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
      />

      <Drawer
        open={Boolean(selectedRow)}
        title="مراجعة طلب الدفع"
        onClose={() => setSelectedRow(null)}
      >
        {selectedRow && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <Link
                  to={`/students/${selectedRow.student_id}`}
                  className="font-bold text-g700 hover:underline"
                >
                  {selectedRow.student_name}
                </Link>
                <StatusTag
                  tone={
                    selectedRow.status === 'approved'
                      ? 'success'
                      : selectedRow.status === 'rejected'
                      ? 'danger'
                      : 'warning'
                  }
                  label={ar.payments.tabs[selectedRow.status]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>موبايل الطالب: <span className="font-mono tabular-nums">{selectedRow.student_phone}</span></div>
                <div>المحافظة: {selectedRow.governorate_name}</div>
                <div>المسار: {selectedRow.track_name}</div>
                <div>الترم: {selectedRow.term_name}</div>
                <div>انتهاء التجربة: <span className="font-mono tabular-nums">{formatCairoDate(selectedRow.student_trial_ends_at)}</span></div>
                <div>طلبات سابقة: <span className="font-mono tabular-nums">{selectedRow.student_previous_requests_count}</span></div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
              <div>
                <p className="text-xs text-slate-500">{ar.payments.expectedAmount}</p>
                <p className="font-mono text-xl font-bold tabular-nums text-g700">
                  {formatEgp(selectedRow.amount_egp)}
                </p>
              </div>
              <div className="text-left">
                <p className="text-xs text-slate-500">{ar.payments.senderPhone}</p>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {selectedRow.sender_phone}
                  </span>
                  <CopyButton value={selectedRow.sender_phone} />
                </div>
              </div>
            </div>

            {/* Proof Image */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">{ar.payments.proofImage}</h3>
                {selectedRow.proof_path && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} aria-label="تكبير">
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="تصغير">
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="تدوير">
                      <RotateCw className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {!selectedRow.proof_path ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
                  {ar.payments.noProofImage}
                </div>
              ) : proofUrlQ.isLoading ? (
                <div className="h-48 animate-pulse rounded-xl bg-slate-100" />
              ) : proofUrlQ.data ? (
                <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4 text-center">
                  <img
                    src={proofUrlQ.data}
                    alt={ar.payments.proofImage}
                    referrerPolicy="no-referrer"
                    style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                    className="mx-auto max-h-80 transition-transform"
                  />
                </div>
              ) : null}
            </div>

            {selectedRow.status === 'pending' ? (
              <div className="space-y-4 border-t border-slate-200 pt-4">
                {!selectedRow.term_access_ends_at && !endsAtOverride && (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-900">
                    {ar.errors.TERM_ACCESS_END_NOT_SET}
                  </p>
                )}

                <div>
                  <label htmlFor="pay-ends-at" className="mb-1 block text-xs font-medium text-slate-700">
                    {ar.payments.endsAtOverride}
                  </label>
                  <input
                    id="pay-ends-at"
                    type="date"
                    value={endsAtOverride}
                    onChange={(e) => setEndsAtOverride(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="pay-reject-reason" className="mb-1 block text-xs font-medium text-slate-700">
                    {ar.payments.rejectReason}
                  </label>
                  <textarea
                    id="pay-reject-reason"
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="اكتب السبب عند الرفض فقط (مثال: المبلغ المحول ناقص أو الرقم غير واضح)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => setConfirmAction('approve')}
                  >
                    {ar.payments.approve}
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={!rejectReason.trim()}
                    onClick={() => setConfirmAction('reject')}
                  >
                    {ar.payments.reject}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1">
                <div>{ar.payments.reviewer}: {selectedRow.reviewer_name ?? '—'}</div>
                <div>{ar.payments.reviewedAt}: {formatCairoDateTime(selectedRow.reviewed_at)}</div>
                {selectedRow.reject_reason && (
                  <div className="text-red-700 font-medium">سبب الرفض: {selectedRow.reject_reason}</div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmAction === 'approve'}
        title={ar.payments.approve}
        message={ar.payments.approveConfirm.replace(
          '{amount}',
          String(selectedRow?.amount_egp ?? 0)
        )}
        loading={approveMut.isPending}
        onConfirm={() => approveMut.mutate()}
        onClose={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'reject'}
        title={ar.payments.reject}
        message={ar.payments.rejectConfirm}
        danger
        loading={rejectMut.isPending}
        onConfirm={() => rejectMut.mutate()}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
}
