import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { formatCairoDateTime } from '../../lib/format';
import { ConfirmDialog } from '../../components/ui/Dialogs';
import { Button, ErrorState, PageHeader, SkeletonRows, Surface } from '../../components/ui/Primitives';

export function AnnouncementsPage() {
  const notify = useNotify();
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [trackId, setTrackId] = React.useState<string>('');
  const [governorateId, setGovernorateId] = React.useState<string>('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });
  const govsQ = useQuery({ queryKey: keys.academic.governorates, queryFn: () => api.getGovernorates() });
  const countQ = useQuery({
    queryKey: keys.announcements.recipientCount(trackId || null, governorateId || null),
    queryFn: () => api.countAnnouncementRecipients(trackId || null, governorateId || null),
  });
  const historyQ = useQuery({
    queryKey: keys.announcements.list({ page: 1 }),
    queryFn: () => api.getAnnouncements({ page: 1, pageSize: 50 }),
  });

  const sendMut = useMutation({
    mutationFn: () =>
      api.sendAnnouncement({
        title,
        body,
        track_id: trackId || null,
        governorate_id: governorateId || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setConfirmOpen(false);
      setTitle('');
      setBody('');
      notify.success('تم إرسال الإعلان للطلاب بنجاح');
    },
    onError: (e) => {
      setConfirmOpen(false);
      notify.error(e);
    },
  });

  const recipientsCount = countQ.data ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.announcements.title}
        subtitle="إرسال إشعارات وإعلانات موجهة حسب المسار أو المحافظة للطلاب غير المحظورين"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Surface className="lg:col-span-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">إعلان جديد</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="ann-title" className="mb-1 block text-sm font-medium">
                {ar.announcements.announcementTitle} *
              </label>
              <input
                id="ann-title"
                required
                minLength={2}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="ann-body" className="mb-1 block text-sm font-medium">
                {ar.announcements.announcementBody} *
              </label>
              <textarea
                id="ann-body"
                required
                rows={4}
                minLength={2}
                maxLength={1000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ann-track" className="mb-1 block text-xs font-medium text-slate-700">
                  {ar.announcements.targetTrack}
                </label>
                <select
                  id="ann-track"
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{ar.announcements.allStudents}</option>
                  {(tracksQ.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name_ar}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ann-gov" className="mb-1 block text-xs font-medium text-slate-700">
                  {ar.announcements.targetGovernorate}
                </label>
                <select
                  id="ann-gov"
                  value={governorateId}
                  onChange={(e) => setGovernorateId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">كل المحافظات</option>
                  {(govsQ.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 tabular-nums">
              {ar.announcements.recipientPreview.replace('{count}', String(recipientsCount))}
            </div>

            <Button type="submit" className="w-full">
              <Send className="h-4 w-4" />
              {ar.announcements.send}
            </Button>
          </form>
        </Surface>

        <Surface className="lg:col-span-7 space-y-4">
          <h2 className="text-base font-bold text-slate-900">{ar.announcements.historyTitle}</h2>
          {historyQ.isLoading ? (
            <SkeletonRows rows={4} />
          ) : historyQ.error ? (
            <ErrorState error={historyQ.error} onRetry={() => historyQ.refetch()} />
          ) : (historyQ.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">{ar.app.noData}</p>
          ) : (
            <div className="space-y-3">
              {(historyQ.data?.items ?? []).map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">{a.title}</h3>
                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {formatCairoDateTime(a.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{a.body}</p>
                  <p className="text-xs text-slate-500 tabular-nums">
                    المستهدفون: {a.track_name ?? 'كل المسارات'} · {a.governorate_name ?? 'كل المحافظات'} · المستلمون: {a.recipients_count}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="تأكيد إرسال الإعلان"
        message={`سيتم إرسال الإعلان «${title}» إلى ${recipientsCount} طالب غير محظور. هل تريد المتابعة؟`}
        loading={sendMut.isPending}
        onConfirm={() => sendMut.mutate()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
