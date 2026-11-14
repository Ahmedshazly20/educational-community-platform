import React from 'react';
import { ar } from '../../i18n/ar';
import { Button, EmptyState, ErrorState, SkeletonRows } from './Primitives';

export interface ColumnDef<TData, _TValue = unknown> {
  id?: string;
  accessorKey?: keyof TData & string;
  header: React.ReactNode | (() => React.ReactNode);
  cell?: (ctx: { row: { original: TData; index: number } }) => React.ReactNode;
}

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({
  data,
  columns,
  isLoading,
  error,
  onRetry,
  emptyTitle = ar.app.noData,
  emptyDescription,
  emptyAction,
  page = 1,
  pageSize = 25,
  total,
  onPageChange,
  onPageSizeChange,
  onRowClick,
}: DataTableProps<TData>) {
  if (isLoading) return <SkeletonRows rows={6} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const totalCount = total ?? data.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-right text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              {columns.map((col, idx) => (
                <th key={col.id ?? col.accessorKey ?? idx} className="px-4 py-3 whitespace-nowrap">
                  {typeof col.header === 'function' ? col.header() : col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((rowOriginal, rowIdx) => (
              <tr
                key={rowIdx}
                onClick={onRowClick ? () => onRowClick(rowOriginal) : undefined}
                className={
                  onRowClick
                    ? 'cursor-pointer transition-colors hover:bg-slate-50'
                    : 'transition-colors hover:bg-slate-50/70'
                }
              >
                {columns.map((col, colIdx) => {
                  const content = col.cell
                    ? col.cell({ row: { original: rowOriginal, index: rowIdx } })
                    : col.accessorKey
                    ? String(rowOriginal[col.accessorKey] ?? '')
                    : null;
                  return (
                    <td
                      key={col.id ?? col.accessorKey ?? colIdx}
                      className="px-4 py-3 align-middle text-slate-800"
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {onPageChange && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          <div className="flex items-center gap-3 tabular-nums">
            <span>{ar.app.totalRows.replace('{count}', String(totalCount))}</span>
            <span>·</span>
            <span>
              {ar.app.pageOf
                .replace('{page}', String(page))
                .replace('{total}', String(totalPages))}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onPageSizeChange && (
              <label className="flex items-center gap-1.5">
                <span>{ar.app.rowsPerPage}</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              {ar.app.prev}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              {ar.app.next}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
