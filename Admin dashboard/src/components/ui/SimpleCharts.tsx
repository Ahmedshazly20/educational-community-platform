import React from 'react';

export interface ChartDatum {
  label: string;
  value: number;
}

export function SimpleBarChart({
  title,
  data,
  unit = '',
}: {
  title: string;
  data: ChartDatum[];
  unit?: string;
}) {
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-semibold text-slate-800">{title}</h3>
      {data.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">لا توجد بيانات للرسم البياني</p>
      ) : (
        <div className="space-y-3">
          {data.map((d) => {
            const pct = Math.round((d.value / maxVal) * 100);
            return (
              <div key={d.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{d.label}</span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {d.value} {unit}
                  </span>
                </div>
                <svg className="h-3 w-full overflow-hidden rounded bg-slate-100" role="img" aria-label={`${d.label}: ${d.value}`}>
                  <rect x="0" y="0" width={`${pct}%`} height="12" fill="#187750" rx="3" />
                </svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
