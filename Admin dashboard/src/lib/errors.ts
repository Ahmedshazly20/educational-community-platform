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

function extractSqlState(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const rec = err as PostgrestLikeError;
  if (typeof rec.code === 'string' && rec.code.trim()) {
    return rec.code.trim();
  }
  if (typeof rec.message === 'string') {
    const trimmed = rec.message.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as { code?: unknown };
        if (typeof parsed.code === 'string' && parsed.code.trim()) {
          return parsed.code.trim();
        }
      } catch {
        // Ignore malformed JSON
      }
    }
    const match = trimmed.match(/\b(42703|42P01|23503|23505|23514|42501)\b/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return '';
}

export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new AppError('NETWORK_OFFLINE');
  }

  if (typeof err === 'string') {
    const match = err.match(/\b(42703|42P01)\b/);
    if (match?.[1]) {
      return new AppError(
        'DATA_CONNECTION_ERROR',
        `${ar.errors.DATA_CONNECTION_ERROR} (${match[1]})`,
        { rawCode: match[1] }
      );
    }
  }

  if (err && typeof err === 'object') {
    const pg = err as PostgrestLikeError;
    const msg = typeof pg.message === 'string' ? pg.message : '';
    const sqlState = extractSqlState(err);

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

    if (sqlState === '42703' || sqlState === '42P01') {
      return new AppError(
        'DATA_CONNECTION_ERROR',
        `${ar.errors.DATA_CONNECTION_ERROR} (${sqlState})`,
        { rawCode: sqlState }
      );
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

    const errCode = typeof (pg as { code?: unknown }).code === 'string' ? (pg as { code: string }).code : '';
    const lowerMsg = msg.toLowerCase();

    if (
      errCode === 'mfa_totp_enroll_not_enabled' ||
      errCode === 'mfa_totp_verify_not_enabled' ||
      (lowerMsg.includes('totp') && lowerMsg.includes('not enabled')) ||
      (lowerMsg.includes('mfa') && lowerMsg.includes('enroll') && lowerMsg.includes('not enabled'))
    ) {
      return new AppError('MFA_NOT_ENABLED', ar.errors.MFA_NOT_ENABLED, {
        rawCode: errCode || msg,
      });
    }

    if (
      errCode === 'mfa_challenge_expired' ||
      (lowerMsg.includes('challenge') && lowerMsg.includes('expired'))
    ) {
      return new AppError('MFA_CHALLENGE_EXPIRED', ar.errors.MFA_CHALLENGE_EXPIRED, {
        rawCode: errCode || msg,
      });
    }

    if (
      errCode === 'mfa_verification_failed' ||
      errCode === 'mfa_verification_rejected' ||
      lowerMsg.includes('invalid totp') ||
      lowerMsg.includes('invalid verification code') ||
      lowerMsg.includes('invalid mfa')
    ) {
      return new AppError('MFA_INVALID_CODE', ar.errors.MFA_INVALID_CODE, {
        rawCode: errCode || msg,
      });
    }

    if (
      errCode === 'too_many_enrolled_mfa_factors' ||
      errCode === 'mfa_factor_name_conflict' ||
      errCode === 'mfa_verified_factor_exists'
    ) {
      return new AppError('MFA_TOO_MANY_FACTORS', ar.errors.MFA_TOO_MANY_FACTORS, {
        rawCode: errCode || msg,
      });
    }

    if (
      lowerMsg.includes('invalid login credentials') ||
      errCode === 'invalid_credentials'
    ) {
      return new AppError('INVALID_CREDENTIALS', ar.errors.INVALID_CREDENTIALS, { rawCode: msg || 'invalid_credentials' });
    }

    if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('network')) {
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
