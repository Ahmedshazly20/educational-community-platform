import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ar } from '../../i18n/ar';
import { api } from '../../data';
import { keys } from '../../data/keys';
import type { Plan } from '../../data/types';
import { queryClient } from '../../app/AppProviders';
import { useNotify } from '../../hooks/useNotify';
import { formatEgp } from '../../lib/format';
import { ConfirmDialog } from '../../components/ui/Dialogs';
import {
  Button,
  ErrorState,
  FieldError,
  ModalShell,
  PageHeader,
  SkeletonRows,
  Surface,
} from '../../components/ui/Primitives';

export function PricingMatrixPage() {
  const notify = useNotify();

  const stagesQ = useQuery({ queryKey: keys.academic.stages, queryFn: () => api.getStages() });
  const tracksQ = useQuery({ queryKey: keys.academic.tracks(), queryFn: () => api.getTracks() });
  const termsQ = useQuery({ queryKey: keys.academic.terms, queryFn: () => api.getTerms() });
  const plansQ = useQuery({ queryKey: keys.pricing.plans, queryFn: () => api.getPlans() });

  const [editCell, setEditCell] = React.useState<{
    trackId: string;
    trackName: string;
    termId: string;
    termName: string;
    existingPlan?: Plan;
  } | null>(null);
  const [priceInput, setPriceInput] = React.useState('');
  const [priceError, setPriceError] = React.useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<Plan | null>(null);

  const savePlanMut = useMutation({
    mutationFn: async () => {
      if (!editCell) return;
      const num = Number(priceInput);
      if (!Number.isFinite(num) || num <= 0) {
        setPriceError('السعر يجب أن يكون رقمًا أكبر من صفر.');
        throw new Error('VALIDATION');
      }
      if (editCell.existingPlan) {
        return api.updatePlan(editCell.existingPlan.id, { price_egp: num, is_active: true });
      }
      return api.createPlan({
        track_id: editCell.trackId,
        term_id: editCell.termId,
        price_egp: num,
        is_active: true,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.pricing.plans });
      setEditCell(null);
      notify.success('تم حفظ خطة التسعير');
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'VALIDATION') return;
      notify.error(e);
    },
  });

  const deactivateMut = useMutation({
    mutationFn: (plan: Plan) =>
      api.updatePlan(plan.id, { price_egp: plan.price_egp, is_active: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.pricing.plans });
      setDeactivateTarget(null);
      notify.success('تم تعطيل الخطة');
    },
    onError: (e) => notify.error(e),
  });

  const deletePlanMut = useMutation({
    mutationFn: (id: string) => api.deletePlan(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.pricing.plans });
      notify.success('تم حذف الخطة');
    },
    onError: (e) => notify.error(e),
  });

  const isLoading = stagesQ.isLoading || tracksQ.isLoading || termsQ.isLoading || plansQ.isLoading;
  const anyError = stagesQ.error || tracksQ.error || termsQ.error || plansQ.error;

  const stages = stagesQ.data ?? [];
  const tracks = tracksQ.data ?? [];
  const terms = termsQ.data ?? [];
  const plans = plansQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={ar.pricing.title} subtitle={ar.pricing.coreRuleNote} />

      {isLoading && <SkeletonRows rows={5} />}
      {anyError && <ErrorState error={anyError} />}

      {!isLoading && !anyError && (
        <Surface>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <th className="p-3">الصف / المسار</th>
                  {terms.map((term) => (
                    <th key={term.id} className="p-3">
                      {term.name_ar}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tracks.map((tr) => {
                  const st = stages.find((s) => s.id === tr.stage_id);
                  return (
                    <tr key={tr.id}>
                      <td className="p-3 font-semibold text-slate-900">
                        {st?.name_ar} — {tr.name_ar}
                      </td>
                      {terms.map((term) => {
                        const activePlan = plans.find(
                          (p) => p.track_id === tr.id && p.term_id === term.id && p.is_active
                        );
                        return (
                          <td key={term.id} className="p-3">
                            {activePlan ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold tabular-nums text-g700">
                                  {formatEgp(activePlan.price_egp)}
                                </span>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setPriceInput(String(activePlan.price_egp));
                                    setPriceError(null);
                                    setEditCell({
                                      trackId: tr.id,
                                      trackName: tr.name_ar,
                                      termId: term.id,
                                      termName: term.name_ar,
                                      existingPlan: activePlan,
                                    });
                                  }}
                                >
                                  {ar.pricing.editPrice}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeactivateTarget(activePlan)}
                                >
                                  تعطيل
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deletePlanMut.mutate(activePlan.id)}
                                >
                                  {ar.app.delete}
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">{ar.pricing.unpriced}</span>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setPriceInput('');
                                    setPriceError(null);
                                    setEditCell({
                                      trackId: tr.id,
                                      trackName: tr.name_ar,
                                      termId: term.id,
                                      termName: term.name_ar,
                                    });
                                  }}
                                >
                                  {ar.pricing.addPrice}
                                </Button>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      <ModalShell
        open={Boolean(editCell)}
        title={
          editCell?.existingPlan
            ? `${ar.pricing.editPrice}: ${editCell.trackName} — ${editCell.termName}`
            : `${ar.pricing.addPrice}: ${editCell?.trackName ?? ''} — ${editCell?.termName ?? ''}`
        }
        onClose={() => setEditCell(null)}
        maxWidth="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            savePlanMut.mutate();
          }}
          className="space-y-4"
        >
          {editCell?.existingPlan && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {ar.pricing.editPriceConfirm}
            </p>
          )}
          <div>
            <label htmlFor="plan-price" className="mb-1 block text-sm font-medium">
              {ar.pricing.priceEgp}
            </label>
            <input
              id="plan-price"
              type="number"
              step="0.01"
              min="1"
              required
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value);
                setPriceError(null);
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            />
            {priceError && <FieldError message={priceError} />}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditCell(null)}>
              {ar.app.cancel}
            </Button>
            <Button type="submit" loading={savePlanMut.isPending}>
              {ar.app.save}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title={ar.pricing.deactivatePlan}
        message={ar.pricing.deactivatePlanConfirm}
        danger
        loading={deactivateMut.isPending}
        onConfirm={() => deactivateTarget && deactivateMut.mutate(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
