import { ar } from '../i18n/ar';
import type { ImportErrorDetail } from '../data/types';

export type AppErrorCode = keyof typeof ar.errors;

export interface AppErrorDetails {
  blockingDependencies?: Array<{ label: string; count: number }>;
  importErrors?: ImportErrorDetail[];
  ungradedCount?: number;
  rawCode?: string;
}

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly details?: AppErrorDetails;

  constructor(code: AppErrorCode, message?: string, details?: AppErrorDetails) {
    super(message ?? ar.errors[code] ?? ar.errors.UNKNOWN);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

const KNOWN_CODES = new Set<string>(Object.keys(ar.errors));

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new AppError('NETWORK_OFFLINE');
  }

  if (err && typeof err === 'object') {
    const pg = err as PostgrestLikeError;
    const msg = typeof pg.message === 'string' ? pg.message : '';
    const sqlState = typeof pg.code === 'string' ? pg.code : '';

    // Check UNGRADED_ANSWERS: N pattern
    const ungradedMatch = msg.match(/UNGRADED_ANSWERS\s*:?\s*(\d+)/i);
    if (ungradedMatch) {
      const count = Number.parseInt(ungradedMatch[1] ?? '0', 10);
      return new AppError(
        'UNGRADED_ANSWERS',
        `${ar.errors.UNGRADED_ANSWERS} (${count})`,
        { ungradedCount: count, rawCode: msg }
      );
    }

    // Check leading CODE from raise exception 'CODE...'
    const leadingCodeMatch = msg.match(/^([A-Z][A-Z0-9_]+)/);
    if (leadingCodeMatch && KNOWN_CODES.has(leadingCodeMatch[1] ?? '')) {
      const code = leadingCodeMatch[1] as AppErrorCode;
      return new AppError(code, ar.errors[code], { rawCode: msg });
    }

    // Check if message itself contains a known error code token
    for (const known of KNOWN_CODES) {
      if (known !== 'UNKNOWN' && msg.includes(known)) {
        const code = known as AppErrorCode;
        return new AppError(code, ar.errors[code], { rawCode: msg });
      }
    }

    if (sqlState === '23503') {
      return new AppError('FK_BLOCKED', ar.errors.FK_BLOCKED, { rawCode: sqlState });
    }
    if (sqlState === '23505') {
      return new AppError('DUPLICATE', ar.errors.DUPLICATE, { rawCode: sqlState });
    }
    if (sqlState === '23514') {
      return new AppError('CHECK_FAILED', ar.errors.CHECK_FAILED, { rawCode: sqlState });
    }
    if (sqlState === '42501') {
      return new AppError('NOT_ALLOWED', ar.errors.NOT_ALLOWED, { rawCode: sqlState });
    }

    if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('network')) {
      return new AppError('NETWORK_OFFLINE', ar.errors.NETWORK_OFFLINE, { rawCode: msg });
    }

    if (err instanceof Error) {
      return new AppError('UNKNOWN', ar.errors.UNKNOWN, { rawCode: err.message });
    }
  }

  return new AppError('UNKNOWN', ar.errors.UNKNOWN);
}

export function getErrorMessage(err: unknown): string {
  const normalized = normalizeError(err);
  if (normalized.code === 'FK_BLOCKED' && normalized.details?.blockingDependencies?.length) {
    const summary = normalized.details.blockingDependencies
      .map((d) => `${d.count} ${d.label}`)
      .join('، ');
    return `${ar.academic.deleteBlockedPrefix} ${summary}`;
  }
  return normalized.message;
}
