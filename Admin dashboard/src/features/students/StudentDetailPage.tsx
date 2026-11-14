import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Smartphone } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../lib/permissions';
import { formatCairoDate, formatCairoDateTime, formatEgp } from '../../lib/format';
import { ConfirmDialog } from '../../components/ui/Dialogs';
import {
  Button,
  CopyButton,
  ErrorState,
  ModalShell,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';

type StudentTab = 'profile' | 'subscriptions' | 'activity' | 'exams' | 'devices';

export function StudentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const roles = useAuthStore((s) => s.session?.roles ?? []);

  const canManage = hasPermission(roles, 'students:manage');
  const canTrack = hasPermission(roles, 'students:track');
  const canLocation = hasPermission(roles, 'students:location');
  const canResetSession = hasPermission(roles, 'students:reset_session');
  const canGrantSub = hasPermission(roles, 'subscriptions:grant');

  const [tab, setTab] = React.useState<StudentTab>('profile');

  const detailQ = useQuery({
    queryKey: keys.students.detail(id),
    queryFn: () => api.getStudentDetail(id),
    enabled: Boolean(id),
  });
  const activityQ = useQuery({
    queryKey: keys.students.activity(id),
    queryFn: () => api.getStudentActivity(id),
    enabled: Boolean(id) && tab === 'activity' && canManage,
  });
  const examsQ = useQuery({
    queryKey: keys.students.exams(id),
    queryFn: () => api.getStudentExams(id),
    enabled: Boolean(id) && tab === 'exams',
  });
  const devicesQ = useQuery({
    queryKey: keys.students.devices(id),
    queryFn: () => api.getStudentDevices(id),
    enabled: Boolean(id) && tab === 'devices',
  });

  const govsQ = useQuery({ queryKey: keys.academic.governorates, queryFn: () => api.getGovernorates() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });

  // Action modals state
  const [trialModal, setTrialModal] = React.useState(false);
  const [trialDays, setTrialDays] = React.useState('7');

  const [blockModal, setBlockModal] = React.useState(false);
  const [blockReason, setBlockReason] = React.useState('');

  const [trackModal, setTrackModal] = React.useState(false);
  const [newTrackId, setNewTrackId] = React.useState('');

  const [locModal, setLocModal] = React.useState(false);
  const [newGovId, setNewGovId] = React.useState('');
  const [newAdminId, setNewAdminId] = React.useState('');

  const [resetSessionModal, setResetSessionModal] = React.useState(false);

  const [grantModal, setGrantModal] = React.useState(false);
  const [grantTermId, setGrantTermId] = React.useState('');
  const [grantEndsAt, setGrantEndsAt] = React.useState('');
  const [grantNote, setGrantNote] = React.useState('');

  const adminsQ = useQuery({
    queryKey: keys.academic.administrations(newGovId),
    queryFn: () => api.getAdministrations(newGovId || undefined),
    enabled: Boolean(newGovId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.students.detail(id) });
    void queryClient.invalidateQueries({ queryKey: keys.students.devices(id) });
    void queryClient.invalidateQueries({ queryKey: ['students', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['pricing', 'subscriptions'] });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard.summary });
  };

  const extendTrialMut = useMutation({
    mutationFn: () => api.extendTrial(id, Number(trialDays)),
    onSuccess: () => {
      invalidate();
      setTrialModal(false);
      notify.success('تم تمديد الفترة التجريبية');
    },
    onError: (e) => notify.error(e),
  });

  const blockMut = useMutation({
    mutationFn: (blocked: boolean) => api.setStudentBlocked(id, blocked, blockReason),
    onSuccess: () => {
      invalidate();
      setBlockModal(false);
      notify.success('تم تحديث حالة الحظر');
    },
    onError: (e) => notify.error(e),
  });

  const trackMut = useMutation({
    mutationFn: () => api.changeStudentTrack(id, newTrackId),
    onSuccess: () => {
      invalidate();
      setTrackModal(false);
      notify.success('تم تغيير مسار الطالب');
    },
    onError: (e) => notify.error(e),
  });

  const locMut = useMutation({
    mutationFn: () => api.updateStudentLocation(id, newGovId, newAdminId || null),
    onSuccess: () => {
      invalidate();
      setLocModal(false);
      notify.success('تم تحديث المحافظة والإدارة');
    },
    onError: (e) => notify.error(e),
  });

  const resetSessionMut = useMutation({
    mutationFn: () => api.resetStudentSession(id),
    onSuccess: () => {
      invalidate();
      setResetSessionModal(false);
      notify.success('تم إعادة تعيين جلسة الجهاز');
    },
    onError: (e) => notify.error(e),
  });

  const grantMut = useMutation({
    mutationFn: () =>
      api.grantSubscription({
        student_id: id,
        term_id: grantTermId,
        ends_at: grantEndsAt,
        note: grantNote || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setGrantModal(false);
      notify.success('تم منح الاشتراك اليدوي بنجاح');
    },
    onError: (e) => notify.error(e),
  });

  if (detailQ.isLoading) {
    return (
      <div>
        <PageHeader title="ملف الطالب" />
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (detailQ.error || !detailQ.data) {
    return (
      <div>
        <PageHeader title="ملف الطالب" />
        <ErrorState error={detailQ.error} onRetry={() => detailQ.refetch()} />
      </div>
    );
  }

  const { student, subscriptions, payments } = detailQ.data;
  const activeTracks = (tracksQ.data ?? []).filter((t) => t.is_active);
  const terms = termsQ.data ?? [];

  const openGrantModal = () => {
    const firstTerm = terms[0];
    setGrantTermId(firstTerm?.id ?? '');
    setGrantEndsAt(firstTerm?.access_ends_at ? firstTerm.access_ends_at.slice(0, 10) : '');
    setGrantNote('');
    setGrantModal(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.full_name}
        breadcrumbs={[{ label: ar.students.title }, { label: student.full_name }]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/students')}>
            <ArrowRight className="h-4 w-4" />
            العودة لقائمة الطلاب
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
        {(Object.keys(ar.students.tabs) as StudentTab[])
          .filter((t) => (t === 'activity' ? canManage : true))
          .map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                tab === t ? 'bg-g700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {ar.students.tabs[t]}
            </button>
          ))}
      </div>

      {tab === 'profile' && (
        <div className="space-y-6">
          <Surface className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">{ar.students.phone} (للقراءة فقط)</p>
              <div className="mt-1 flex items-center gap-1 font-mono font-semibold tabular-nums">
                <span>{student.phone}</span>
                <CopyButton value={student.phone} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">{ar.students.guardianPhone}</p>
              <p className="mt-1 font-mono tabular-nums">{student.guardian_phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{ar.app.status}</p>
              <div className="mt-1">
                {student.is_blocked ? (
                  <StatusTag tone="danger" label={`${ar.students.blocked}${student.block_reason ? `: ${student.block_reason}` : ''}`} />
                ) : (
                  <StatusTag tone="success" label={ar.students.activeAccount} />
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500">الصف / {ar.students.track}</p>
              <p className="mt-1 font-semibold">
                {student.stage_name} · {student.track_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">
                {ar.students.governorate} / {ar.students.administration}
              </p>
              <p className="mt-1">
                {student.governorate_name}
                {student.administration_name ? ` · ${student.administration_name}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{ar.students.trialState}</p>
              <p className="mt-1 font-mono tabular-nums">
                {formatCairoDate(student.trial_ends_at)} (
                {student.trial_days_left > 0
                  ? ar.students.trialRemaining.replace('{days}', String(student.trial_days_left))
                  : ar.students.trialEnded}
                )
              </p>
            </div>
          </Surface>

          <Surface className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">الإجراءات المتاحة حسب صلاحيتك</h2>
            <div className="flex flex-wrap items-center gap-2">
              {canManage && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setTrialModal(true)}>
                    {ar.students.extendTrial}
                  </Button>
                  <Button
                    size="sm"
                    variant={student.is_blocked ? 'primary' : 'danger'}
                    onClick={() => {
                      setBlockReason('');
                      setBlockModal(true);
                    }}
                  >
                    {student.is_blocked ? ar.students.unblockStudent : ar.students.blockStudent}
                  </Button>
                </>
              )}
              {canTrack && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setNewTrackId(student.track_id);
                    setTrackModal(true);
                  }}
                >
                  {ar.students.changeTrack}
                </Button>
              )}
              {canLocation && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setNewGovId(student.governorate_id);
                    setNewAdminId(student.administration_id ?? '');
                    setLocModal(true);
                  }}
                >
                  {ar.students.changeLocation}
                </Button>
              )}
              {canResetSession && (
                <Button size="sm" variant="secondary" onClick={() => setResetSessionModal(true)}>
                  {ar.students.resetSession}
                </Button>
              )}
              {canGrantSub && (
                <Button size="sm" onClick={openGrantModal}>
                  {ar.pricing.grantSubscription}
                </Button>
              )}
            </div>
          </Surface>
        </div>
      )}

      {tab === 'subscriptions' && (
        <div className="space-y-6">
          <Surface className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">الاشتراكات</h2>
              {canGrantSub && (
                <Button size="sm" onClick={openGrantModal}>
                  {ar.pricing.grantSubscription}
                </Button>
              )}
            </div>
            {subscriptions.length === 0 ? (
              <p className="text-sm text-slate-500">{ar.app.noData}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-right text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2 pl-4">المسار / الترم</th>
                      <th className="py-2 pl-4">المبلغ</th>
                      <th className="py-2 pl-4">الفترة</th>
                      <th className="py-2">{ar.app.status}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subscriptions.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pl-4">
                          {s.track_name} · {s.term_name}
                        </td>
                        <td className="py-2.5 pl-4 font-mono tabular-nums">{formatEgp(s.price_paid_egp)}</td>
                        <td className="py-2.5 pl-4 font-mono text-xs tabular-nums">
                          {formatCairoDate(s.starts_at)} — {formatCairoDate(s.ends_at)}
                        </td>
                        <td className="py-2.5">
                          <StatusTag
                            tone={s.status === 'active' ? 'success' : 'neutral'}
                            label={ar.pricing.subscriptionStatuses[s.status]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>

          <Surface className="space-y-3">
            <h2 className="text-base font-bold">سجل طلبات الدفع</h2>
            {payments.length === 0 ? (
              <p className="text-sm text-slate-500">{ar.app.noData}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-right text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-2 pl-4">التاريخ</th>
                      <th className="py-2 pl-4">الترم</th>
                      <th className="py-2 pl-4">المبلغ</th>
                      <th className="py-2">{ar.app.status}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 pl-4 font-mono text-xs tabular-nums">
                          {formatCairoDateTime(p.created_at)}
                        </td>
                        <td className="py-2.5 pl-4">{p.term_name}</td>
                        <td className="py-2.5 pl-4 font-mono tabular-nums">{formatEgp(p.amount_egp)}</td>
                        <td className="py-2.5">
                          <StatusTag
                            tone={
                              p.status === 'approved'
                                ? 'success'
                                : p.status === 'rejected'
                                ? 'danger'
                                : 'warning'
                            }
                            label={ar.payments.tabs[p.status]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </div>
      )}

      {tab === 'activity' && (
        <Surface className="space-y-4">
          {activityQ.isLoading ? (
            <SkeletonRows rows={4} />
          ) : (
            <>
              <h2 className="text-base font-bold">العناصر المكتملة ({activityQ.data?.progress.length ?? 0})</h2>
              {(activityQ.data?.progress ?? []).map((p) => (
                <div key={p.item_id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span>{p.lesson_title} — {p.item_title}</span>
                  <span className="font-mono tabular-nums text-slate-500">{formatCairoDateTime(p.completed_at)}</span>
                </div>
              ))}
              <h2 className="pt-4 text-base font-bold">إجابات الأسئلة السريعة ({activityQ.data?.quickAnswers.length ?? 0})</h2>
              {(activityQ.data?.quickAnswers ?? []).map((qa) => (
                <div key={qa.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span>{qa.prompt} ({qa.selected_option_text})</span>
                  <StatusTag tone={qa.is_correct ? 'success' : 'danger'} label={qa.is_correct ? 'صحيحة' : 'خاطئة'} />
                </div>
              ))}
            </>
          )}
        </Surface>
      )}

      {tab === 'exams' && (
        <Surface className="space-y-4">
          {examsQ.isLoading ? (
            <SkeletonRows rows={4} />
          ) : (
            <>
              <h2 className="text-base font-bold">المحاولات والنتائج</h2>
              {(examsQ.data?.results ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">لا توجد نتائج معتمدة بعد.</p>
              ) : (
                <div className="space-y-2">
                  {(examsQ.data?.results ?? []).map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
                      <span className="font-semibold">{r.exam_title ?? r.exam_id}</span>
                      <span className="font-mono tabular-nums font-bold text-g700">
                        {r.total_score} / {r.max_score} ({r.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Surface>
      )}

      {tab === 'devices' && (
        <Surface className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{ar.students.tabs.devices}</h2>
            {canResetSession && (
              <Button size="sm" variant="secondary" onClick={() => setResetSessionModal(true)}>
                {ar.students.resetSession}
              </Button>
            )}
          </div>
          {devicesQ.isLoading ? (
            <SkeletonRows rows={3} />
          ) : (devicesQ.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">{ar.app.noData}</p>
          ) : (
            <div className="space-y-2">
              {(devicesQ.data ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="font-semibold">{d.device_label}</p>
                      <p className="font-mono text-xs text-slate-500">{d.device_id}</p>
                    </div>
                  </div>
                  <StatusTag tone={d.is_active ? 'success' : 'neutral'} label={d.is_active ? 'جلسة نشطة' : 'منتهية'} />
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {/* Modals */}
      <ModalShell open={trialModal} title={ar.students.extendTrial} onClose={() => setTrialModal(false)} maxWidth="max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            extendTrialMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="trial-days" className="mb-1 block text-sm font-medium">
              {ar.students.extendDays}
            </label>
            <input
              id="trial-days"
              type="number"
              min={1}
              max={365}
              required
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTrialModal(false)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={extendTrialMut.isPending}>
              {ar.app.confirm}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ConfirmDialog
        open={blockModal}
        title={student.is_blocked ? ar.students.unblockStudent : ar.students.blockStudent}
        message={
          student.is_blocked
            ? 'سيستعيد الطالب قدرته على تسجيل الدخول والوصول لمحتواه.'
            : ar.students.blockConsequence
        }
        danger={!student.is_blocked}
        loading={blockMut.isPending}
        onConfirm={() => blockMut.mutate(!student.is_blocked)}
        onClose={() => setBlockModal(false)}
      >
        {!student.is_blocked && (
          <div>
            <label htmlFor="block-reason" className="mb-1 block text-xs font-medium text-slate-700">
              {ar.students.blockReason} ({ar.app.optional})
            </label>
            <input
              id="block-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        )}
      </ConfirmDialog>

      <ModalShell open={trackModal} title={ar.students.changeTrack} onClose={() => setTrackModal(false)} maxWidth="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            trackMut.mutate();
          }}
          className="space-y-4"
        >
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {ar.students.changeTrackWarning}
          </p>
          <div>
            <label htmlFor="new-track-select" className="mb-1 block text-sm font-medium">
              المسار الجديد (النشط فقط)
            </label>
            <select
              id="new-track-select"
              required
              value={newTrackId}
              onChange={(e) => setNewTrackId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {activeTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTrackModal(false)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={trackMut.isPending}>
              {ar.app.confirm}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={locModal} title={ar.students.changeLocation} onClose={() => setLocModal(false)} maxWidth="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            locMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="loc-gov" className="mb-1 block text-sm font-medium">
              {ar.students.governorate}
            </label>
            <select
              id="loc-gov"
              required
              value={newGovId}
              onChange={(e) => {
                setNewGovId(e.target.value);
                setNewAdminId('');
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {(govsQ.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="loc-admin" className="mb-1 block text-sm font-medium">
              {ar.students.administration} ({ar.app.optional})
            </label>
            <select
              id="loc-admin"
              value={newAdminId}
              onChange={(e) => setNewAdminId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">بدون إدارة</option>
              {(adminsQ.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLocModal(false)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={locMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ConfirmDialog
        open={resetSessionModal}
        title={ar.students.resetSession}
        message={ar.students.resetSessionConfirm}
        loading={resetSessionMut.isPending}
        onConfirm={() => resetSessionMut.mutate()}
        onClose={() => setResetSessionModal(false)}
      />

      <ModalShell open={grantModal} title={ar.pricing.grantSubscription} onClose={() => setGrantModal(false)} maxWidth="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            grantMut.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="grant-term" className="mb-1 block text-sm font-medium">
              الترم *
            </label>
            <select
              id="grant-term"
              required
              value={grantTermId}
              onChange={(e) => {
                setGrantTermId(e.target.value);
                const t = terms.find((x) => x.id === e.target.value);
                setGrantEndsAt(t?.access_ends_at ? t.access_ends_at.slice(0, 10) : '');
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name_ar}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="grant-ends-at" className="mb-1 block text-sm font-medium">
              تاريخ الانتهاء *
            </label>
            <input
              id="grant-ends-at"
              type="date"
              required
              value={grantEndsAt}
              onChange={(e) => setGrantEndsAt(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor="grant-note" className="mb-1 block text-sm font-medium">
              ملاحظة ({ar.app.optional})
            </label>
            <input
              id="grant-note"
              value={grantNote}
              onChange={(e) => setGrantNote(e.target.value)}
              placeholder="مثال: منحة تفوق"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setGrantModal(false)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={grantMut.isPending}>
              {ar.app.confirm}
            </Button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
