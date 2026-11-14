import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, UserPlus } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { createStaffSchema } from '../../data/schemas';
import type { StaffProfile, StaffRole } from '../../data/types';
import { useNotify } from '../../hooks/useNotify';
import { formatCairoDate } from '../../lib/format';
import { AppError } from '../../lib/errors';
import {
  Button,
  EmptyState,
  ErrorState,
  FieldError,
  ModalShell,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';
import { ConfirmDialog } from '../../components/ui/Dialogs';

const ALL_ROLES: StaffRole[] = [
  'admin',
  'students_manager',
  'payments_reviewer',
  'support',
  'content',
  'exams',
  'grader',
];

export function StaffPage() {
  const qc = useQueryClient();
  const notify = useNotify();

  const staffQ = useQuery({
    queryKey: keys.staff.list,
    queryFn: () => api.getStaffList(),
  });

  const [addOpen, setAddOpen] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState('');
  const [newName, setNewName] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [newRoles, setNewRoles] = React.useState<StaffRole[]>(['support']);
  const [addErr, setAddErr] = React.useState<string | undefined>();
  const [edgeUnavailable, setEdgeUnavailable] = React.useState(false);

  const [editTarget, setEditTarget] = React.useState<StaffProfile | null>(null);
  const [editRoles, setEditRoles] = React.useState<StaffRole[]>([]);

  const [toggleTarget, setToggleTarget] = React.useState<StaffProfile | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      const parsed = createStaffSchema.safeParse({
        email: newEmail,
        full_name: newName,
        password: newPassword,
        roles: newRoles,
      });
      if (!parsed.success) {
        setAddErr(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة');
        throw new Error('VALIDATION');
      }
      setAddErr(undefined);
      return api.createStaffMember(parsed.data);
    },
    onSuccess: () => {
      setAddOpen(false);
      setNewEmail('');
      setNewName('');
      setNewPassword('');
      setNewRoles(['support']);
      qc.invalidateQueries({ queryKey: keys.staff.list });
      notify.success('تم إضافة عضو الفريق بنجاح');
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'VALIDATION') return;
      if (e instanceof AppError && e.details?.rawCode === 'EDGE_FUNCTION_UNAVAILABLE') {
        setEdgeUnavailable(true);
      }
      notify.error(e);
    },
  });

  const updateRolesMut = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      await api.updateStaffRoles(editTarget.id, editRoles);
    },
    onSuccess: () => {
      setEditTarget(null);
      qc.invalidateQueries({ queryKey: keys.staff.list });
      notify.success('تم تحديث أدوار عضو الفريق');
    },
    onError: (e) => notify.error(e),
  });

  const toggleActiveMut = useMutation({
    mutationFn: async () => {
      if (!toggleTarget) return;
      await api.setStaffActive(toggleTarget.id, !toggleTarget.is_active);
    },
    onSuccess: () => {
      setToggleTarget(null);
      qc.invalidateQueries({ queryKey: keys.staff.list });
      notify.success('تم تحديث حالة الحساب');
    },
    onError: (e) => notify.error(e),
  });

  const toggleRoleInList = (list: StaffRole[], role: StaffRole): StaffRole[] =>
    list.includes(role) ? list.filter((r) => r !== role) : [...list, role];

  const staff = staffQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.staff.title}
        subtitle="إدارة حسابات الإدارة والأدوار الوظيفية (لا يمكن إزالة آخر مدير عام نشط)"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" />
            {ar.staff.addStaff}
          </Button>
        }
      />

      {edgeUnavailable && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {ar.staff.edgeUnavailable}
        </div>
      )}

      <Surface>
        {staffQ.isLoading ? (
          <SkeletonRows rows={5} />
        ) : staffQ.error ? (
          <ErrorState error={staffQ.error} onRetry={() => staffQ.refetch()} />
        ) : staff.length === 0 ? (
          <EmptyState title="لا يوجد أعضاء فريق" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">{ar.staff.fullName}</th>
                  <th className="px-4 py-3">{ar.auth.email}</th>
                  <th className="px-4 py-3">{ar.staff.roles}</th>
                  <th className="px-4 py-3">{ar.app.status}</th>
                  <th className="px-4 py-3">{ar.app.createdAt}</th>
                  <th className="px-4 py-3">{ar.app.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{m.full_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{m.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {m.roles.map((r) => (
                          <StatusTag key={r} tone={r === 'admin' ? 'info' : 'neutral'} label={ar.roles[r]} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusTag
                        tone={m.is_active ? 'success' : 'danger'}
                        label={m.is_active ? ar.academic.active : ar.academic.inactive}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-500">
                      {formatCairoDate(m.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditTarget(m);
                            setEditRoles(m.roles);
                          }}
                        >
                          <Shield className="h-3.5 w-3.5" />
                          تعديل الأدوار
                        </Button>
                        <Button
                          variant={m.is_active ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => setToggleTarget(m)}
                        >
                          {m.is_active ? 'تعطيل' : 'تفعيل'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* Add Staff Modal */}
      <ModalShell open={addOpen} title={ar.staff.addStaff} onClose={() => setAddOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{ar.staff.fullName}</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{ar.auth.email}</label>
            <input
              type="email"
              dir="ltr"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{ar.auth.password}</label>
            <input
              type="password"
              dir="ltr"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left"
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">{ar.staff.roles}</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map((r) => (
                <label
                  key={r}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={newRoles.includes(r)}
                    onChange={() => setNewRoles((prev) => toggleRoleInList(prev, r))}
                  />
                  <span>{ar.roles[r]}</span>
                </label>
              ))}
            </div>
          </div>
          <FieldError message={addErr} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              {ar.app.cancel}
            </Button>
            <Button loading={createMut.isPending} onClick={() => createMut.mutate()}>
              {ar.app.save}
            </Button>
          </div>
        </div>
      </ModalShell>

      {/* Edit Roles Modal */}
      <ModalShell
        open={Boolean(editTarget)}
        title={`تعديل أدوار: ${editTarget?.full_name ?? ''}`}
        onClose={() => setEditTarget(null)}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">{ar.staff.lastAdminNote}</p>
          <div className="grid grid-cols-2 gap-2">
            {ALL_ROLES.map((r) => (
              <label
                key={r}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={editRoles.includes(r)}
                  onChange={() => setEditRoles((prev) => toggleRoleInList(prev, r))}
                />
                <span>{ar.roles[r]}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditTarget(null)}>
              {ar.app.cancel}
            </Button>
            <Button
              loading={updateRolesMut.isPending}
              disabled={editRoles.length === 0}
              onClick={() => updateRolesMut.mutate()}
            >
              {ar.app.save}
            </Button>
          </div>
        </div>
      </ModalShell>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        title={toggleTarget?.is_active ? 'تعطيل حساب موظف' : 'تفعيل حساب موظف'}
        message={
          toggleTarget?.is_active
            ? `هل تريد تعطيل حساب ${toggleTarget.full_name}؟ لن يتمكن من الدخول إلى لوحة الإدارة.`
            : `هل تريد إعادة تفعيل حساب ${toggleTarget?.full_name ?? ''}؟`
        }
        danger={Boolean(toggleTarget?.is_active)}
        loading={toggleActiveMut.isPending}
        onConfirm={() => toggleActiveMut.mutate()}
        onClose={() => setToggleTarget(null)}
      />
    </div>
  );
}
