import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload } from 'lucide-react';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import { allowedDomainSchema } from '../../data/schemas';
import type { LinkKind, Term } from '../../data/types';
import { useNotify } from '../../hooks/useNotify';
import { formatCairoDate } from '../../lib/format';
import { parseAdministrationsExcelBuffer } from '../../lib/xlsx';
import {
  Button,
  ErrorState,
  FieldError,
  ModalShell,
  PageHeader,
  SkeletonRows,
  StatusTag,
  Surface,
} from '../../components/ui/Primitives';

export function SettingsPage() {
  const qc = useQueryClient();
  const notify = useNotify();

  const domainsQ = useQuery({
    queryKey: keys.academic.allowedDomains,
    queryFn: () => api.getAllowedLinkDomains(),
  });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });
  const govsQ = useQuery({ queryKey: keys.academic.governorates, queryFn: () => api.getGovernorates() });

  const [selectedGovId, setSelectedGovId] = React.useState('');
  const govs = govsQ.data ?? [];

  React.useEffect(() => {
    if (!selectedGovId && govs.length > 0 && govs[0]) {
      setSelectedGovId(govs[0].id);
    }
  }, [govs, selectedGovId]);

  const adminsQ = useQuery({
    queryKey: keys.academic.administrations(selectedGovId),
    queryFn: () => api.getAdministrations(selectedGovId),
    enabled: Boolean(selectedGovId),
  });

  // Allowed Domain Form
  const [domainInput, setDomainInput] = React.useState('');
  const [domainKind, setDomainKind] = React.useState<LinkKind>('video');
  const [domainErr, setDomainErr] = React.useState<string | undefined>();

  // Term End Edit Modal
  const [editingTerm, setEditingTerm] = React.useState<Term | null>(null);
  const [termEndDate, setTermEndDate] = React.useState('');

  // Location forms
  const [newAdminName, setNewAdminName] = React.useState('');
  const [newGovName, setNewGovName] = React.useState('');
  const [importSummary, setImportSummary] = React.useState<{
    inserted: number;
    skippedDuplicates: number;
    unknownGovernorates: string[];
  } | null>(null);
  const excelInputRef = React.useRef<HTMLInputElement | null>(null);

  const createDomainMut = useMutation({
    mutationFn: async () => {
      const parsed = allowedDomainSchema.safeParse({
        domain: domainInput,
        kind: domainKind,
        is_active: true,
      });
      if (!parsed.success) {
        setDomainErr(parsed.error.issues[0]?.message ?? 'نطاق غير صالح');
        throw new Error('VALIDATION');
      }
      setDomainErr(undefined);
      return api.createAllowedLinkDomain(parsed.data);
    },
    onSuccess: () => {
      setDomainInput('');
      qc.invalidateQueries({ queryKey: keys.academic.allowedDomains });
      notify.success('تم إضافة النطاق المسموح');
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'VALIDATION') return;
      notify.error(e);
    },
  });

  const toggleDomainMut = useMutation({
    mutationFn: (d: { id: string; domain: string; kind: LinkKind; is_active: boolean }) =>
      api.updateAllowedLinkDomain(d.id, {
        domain: d.domain,
        kind: d.kind,
        is_active: !d.is_active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.academic.allowedDomains });
      notify.success('تم تحديث حالة النطاق');
    },
    onError: (e) => notify.error(e),
  });

  const deleteDomainMut = useMutation({
    mutationFn: (id: string) => api.deleteAllowedLinkDomain(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.academic.allowedDomains });
      notify.success('تم حذف النطاق');
    },
    onError: (e) => notify.error(e),
  });

  const saveTermEndMut = useMutation({
    mutationFn: async () => {
      if (!editingTerm) return;
      await api.updateTerm(editingTerm.id, {
        name_ar: editingTerm.name_ar,
        sort_order: editingTerm.sort_order,
        access_ends_at: termEndDate ? new Date(`${termEndDate}T23:59:59+02:00`).toISOString() : null,
      });
    },
    onSuccess: () => {
      setEditingTerm(null);
      qc.invalidateQueries({ queryKey: keys.academic.terms });
      qc.invalidateQueries({ queryKey: keys.dashboard.summary });
      notify.success('تم تحديث تاريخ انتهاء الوصول للترم');
    },
    onError: (e) => notify.error(e),
  });

  const addGovMut = useMutation({
    mutationFn: () =>
      api.createGovernorate({
        name_ar: newGovName.trim(),
        sort_order: govs.length + 1,
      }),
    onSuccess: () => {
      setNewGovName('');
      qc.invalidateQueries({ queryKey: keys.academic.governorates });
      notify.success('تم إضافة المحافظة');
    },
    onError: (e) => notify.error(e),
  });

  const addAdminMut = useMutation({
    mutationFn: () =>
      api.createAdministration({
        governorate_id: selectedGovId,
        name_ar: newAdminName.trim(),
        is_active: true,
      }),
    onSuccess: () => {
      setNewAdminName('');
      qc.invalidateQueries({ queryKey: keys.academic.administrations(selectedGovId) });
      notify.success('تم إضافة الإدارة التعليمية');
    },
    onError: (e) => notify.error(e),
  });

  const deleteAdminMut = useMutation({
    mutationFn: (id: string) => api.deleteAdministration(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.academic.administrations(selectedGovId) });
      notify.success('تم حذف الإدارة التعليمية');
    },
    onError: (e) => notify.error(e),
  });

  const handleImportAdminsExcel = async (file: File | undefined) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const { rows, errors } = parseAdministrationsExcelBuffer(buffer);
    if (errors.length > 0 && rows.length === 0) {
      notify.error(new Error(errors[0]?.message ?? 'ملف غير صالح'));
      return;
    }
    try {
      const summary = await api.bulkImportAdministrations(rows);
      setImportSummary(summary);
      qc.invalidateQueries({ queryKey: keys.academic.administrations(selectedGovId) });
      notify.success(`تم استيراد ${summary.inserted} إدارة تعليمية`);
    } catch (e) {
      notify.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.settings.title}
        subtitle="نطاقات الروابط المسموحة، تواريخ انتهاء وصول الترمات، المحافظات والإدارات التعليمية"
      />

      {/* Section 1: Trial Policy Read-Only */}
      <Surface>
        <h2 className="text-base font-bold text-slate-900">{ar.settings.trialInfoTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{ar.settings.trialInfoBody}</p>
      </Surface>

      {/* Section 2: Terms access_ends_at */}
      <Surface className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">{ar.settings.termsTitle}</h2>
        {termsQ.isLoading ? (
          <SkeletonRows rows={2} />
        ) : termsQ.error ? (
          <ErrorState error={termsQ.error} onRetry={() => termsQ.refetch()} />
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {(termsQ.data ?? []).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{t.name_ar}</p>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    {t.access_ends_at ? `ينتهي في: ${formatCairoDate(t.access_ends_at)}` : 'غير محدد'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!t.access_ends_at && <StatusTag tone="danger" label="غير محدد" />}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingTerm(t);
                      setTermEndDate(t.access_ends_at ? t.access_ends_at.slice(0, 10) : '');
                    }}
                  >
                    تحديد / تعديل التاريخ
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>

      {/* Section 3: Allowed Link Domains */}
      <Surface className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">{ar.settings.allowedDomainsTitle}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{ar.settings.domainHint}</p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              dir="ltr"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="youtube.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left font-mono"
            />
          </div>
          <select
            value={domainKind}
            onChange={(e) => setDomainKind(e.target.value as LinkKind)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="video">{ar.content.linkKinds.video}</option>
            <option value="document">{ar.content.linkKinds.document}</option>
          </select>
          <Button loading={createDomainMut.isPending} onClick={() => createDomainMut.mutate()}>
            <Plus className="h-4 w-4" />
            {ar.app.add}
          </Button>
        </div>
        <FieldError message={domainErr} />

        {domainsQ.isLoading ? (
          <SkeletonRows rows={3} />
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {(domainsQ.data ?? []).map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <span dir="ltr" className="font-mono font-semibold text-slate-900">
                    {d.domain}
                  </span>
                  <StatusTag tone="info" label={ar.content.linkKinds[d.kind]} />
                  <StatusTag
                    tone={d.is_active ? 'success' : 'neutral'}
                    label={d.is_active ? ar.academic.active : ar.academic.inactive}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => toggleDomainMut.mutate(d)}>
                    {d.is_active ? 'تعطيل' : 'تفعيل'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={ar.app.delete}
                    onClick={() => deleteDomainMut.mutate(d.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>

      {/* Section 4: Governorates & Administrations */}
      <Surface className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">{ar.settings.locationsTitle}</h2>
          <div>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void handleImportAdminsExcel(e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => excelInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {ar.settings.importAdminsExcel}
            </Button>
          </div>
        </div>

        {importSummary && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
            <p>تمت إضافة: {importSummary.inserted} · مكررات متجاهلة: {importSummary.skippedDuplicates}</p>
            {importSummary.unknownGovernorates.length > 0 && (
              <p className="text-amber-900">
                محافظات غير مطابقة: {importSummary.unknownGovernorates.join('، ')}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700">
              اختر المحافظة ({govs.length}):
              <select
                value={selectedGovId}
                onChange={(e) => setSelectedGovId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {govs.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name_ar}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newGovName}
                onChange={(e) => setNewGovName(e.target.value)}
                placeholder="إضافة محافظة جديدة..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <Button
                variant="secondary"
                disabled={!newGovName.trim()}
                loading={addGovMut.isPending}
                onClick={() => addGovMut.mutate()}
              >
                إضافة
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-700">الإدارات التعليمية للمحافظة المختارة:</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="اسم الإدارة التعليمية الجديدة..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <Button
                disabled={!newAdminName.trim() || !selectedGovId}
                loading={addAdminMut.isPending}
                onClick={() => addAdminMut.mutate()}
              >
                إضافة
              </Button>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
              {(adminsQ.data ?? []).map((ad) => (
                <div key={ad.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{ad.name_ar}</span>
                  <button
                    type="button"
                    onClick={() => deleteAdminMut.mutate(ad.id)}
                    aria-label={ar.app.delete}
                    className="rounded p-1 text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Surface>

      <ModalShell
        open={Boolean(editingTerm)}
        title={`تعديل تاريخ انتهاء الوصول: ${editingTerm?.name_ar ?? ''}`}
        onClose={() => setEditingTerm(null)}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <input
            type="date"
            value={termEndDate}
            onChange={(e) => setTermEndDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingTerm(null)}>
              {ar.app.cancel}
            </Button>
            <Button loading={saveTermEndMut.isPending} onClick={() => saveTermEndMut.mutate()}>
              {ar.app.save}
            </Button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
