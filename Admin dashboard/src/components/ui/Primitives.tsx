import React from 'react';
import {
  AlertTriangle,
  Atom,
  BookOpen,
  Calculator,
  Check,
  Compass,
  Copy,
  Cpu,
  Dna,
  FlaskConical,
  Globe,
  Languages,
  RefreshCw,
  ScrollText,
  X,
} from 'lucide-react';
import type { CourseIconKey } from '../../data/types';
import { ar } from '../../i18n/ar';
import { getErrorMessage } from '../../lib/errors';

export function CourseIcon({
  iconKey,
  className = 'h-4 w-4 text-g700',
}: {
  iconKey: CourseIconKey;
  className?: string;
}) {
  switch (iconKey) {
    case 'atom':
      return <Atom className={className} />;
    case 'flask':
      return <FlaskConical className={className} />;
    case 'book':
      return <BookOpen className={className} />;
    case 'calculator':
      return <Calculator className={className} />;
    case 'globe':
      return <Globe className={className} />;
    case 'dna':
      return <Dna className={className} />;
    case 'scroll':
      return <ScrollText className={className} />;
    case 'languages':
      return <Languages className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'cpu':
      return <Cpu className={className} />;
  }
}

export const COURSE_ICON_OPTIONS: ReadonlyArray<{ key: CourseIconKey; label: string }> = [
  { key: 'atom', label: 'ذرة (الفيزياء)' },
  { key: 'flask', label: 'قارورة (الكيمياء)' },
  { key: 'book', label: 'كتاب (اللغة / الأدب)' },
  { key: 'calculator', label: 'آلة حاسبة (الرياضيات)' },
  { key: 'dna', label: 'حمض نووي (الأحياء)' },
  { key: 'globe', label: 'كرة أرضية (الجغرافيا)' },
  { key: 'scroll', label: 'مخطوطة (التاريخ / الفلسفة)' },
  { key: 'languages', label: 'لغات (الأجنبية)' },
  { key: 'compass', label: 'بوصلة (الجبر / الهندسة)' },
  { key: 'cpu', label: 'معالج (تقنية)' },
];

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-g700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const sizes = size === 'sm' ? 'px-3 py-1.5 text-xs min-h-[34px]' : 'px-4 py-2 text-sm min-h-[40px]';
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-g700 text-white hover:bg-g800',
    secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-slate-700 hover:bg-slate-100',
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${sizes} ${variants[variant]} ${className}`}
      {...rest}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function StatusTag({
  tone,
  label,
}: {
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  label: string;
}) {
  const styles: Record<typeof tone, string> = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 ${styles[tone]}`}
    >
      {label}
    </span>
  );
}

export function PageHeader({
  title,
  breadcrumbs,
  actions,
  subtitle,
}: {
  title: string;
  breadcrumbs?: Array<{ label: string; to?: string }>;
  actions?: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="مسار التنقل" className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {breadcrumbs.map((b, idx) => (
              <React.Fragment key={`${b.label}-${idx}`}>
                {idx > 0 && <span aria-hidden="true">/</span>}
                <span className={idx === breadcrumbs.length - 1 ? 'font-medium text-slate-700' : ''}>
                  {b.label}
                </span>
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Surface({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>{children}</div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label={ar.app.loading}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const message = getErrorMessage(error);
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center"
    >
      <AlertTriangle className="h-7 w-7 text-red-600" />
      <p className="mt-2 text-sm font-semibold text-red-900">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
          <RefreshCw className="h-3.5 w-3.5" />
          {ar.app.retry}
        </Button>
      )}
    </div>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label ?? `${ar.app.copy} ${value}`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied && <span>{ar.app.copied}</span>}
    </button>
  );
}

export function AudienceBanner({
  tracks,
}: {
  tracks: Array<{ trackName: string; stageName: string }>;
}) {
  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        تنبيه: هذه المادة غير مرتبطة بأي مسار دراسي حاليًا، ولن تظهر لأي طالب حتى يتم ربطها بمسار من الهيكل الأكاديمي.
      </div>
    );
  }

  const labelList = tracks.map((t) => `${t.stageName} / ${t.trackName}`).join(' · ');
  const isMulti = tracks.length > 1;

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        isMulti
          ? 'border-amber-200 bg-amber-50 text-amber-950'
          : 'border-slate-200 bg-slate-50 text-slate-800'
      }`}
    >
      <div className="font-medium">
        {ar.content.audienceBannerPrefix} <span className="font-semibold">{labelList}</span>
      </div>
      {isMulti && <p className="mt-1 text-xs text-amber-800">{ar.content.multiTrackAudienceWarning}</p>}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}

export function ModalShell({
  open,
  title,
  onClose,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl`}>
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={ar.app.close}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
