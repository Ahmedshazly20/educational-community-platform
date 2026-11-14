import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, normalizeError, getErrorMessage } from './errors';

test('normalizes PostgreSQL constraint codes and leading P0001 codes', () => {
  assert.equal(normalizeError({ code: '23503', message: 'fk' }).code, 'FK_BLOCKED');
  assert.equal(normalizeError({ code: '23505', message: 'uniq' }).code, 'DUPLICATE');
  assert.equal(normalizeError({ code: '23514', message: 'chk' }).code, 'CHECK_FAILED');
  assert.equal(normalizeError({ code: '42501', message: 'rls' }).code, 'NOT_ALLOWED');
  assert.equal(
    normalizeError({ code: 'P0001', message: 'REQUEST_ALREADY_REVIEWED: already done' }).code,
    'REQUEST_ALREADY_REVIEWED'
  );
  const ungraded = normalizeError({ code: 'P0001', message: 'UNGRADED_ANSWERS: 7' });
  assert.equal(ungraded.code, 'UNGRADED_ANSWERS');
  assert.equal(ungraded.details?.ungradedCount, 7);
});

test('formats FK_BLOCKED with blocking dependency names in Arabic', () => {
  const err = new AppError('FK_BLOCKED', undefined, {
    blockingDependencies: [
      { label: 'درس', count: 12 },
      { label: 'امتحان', count: 3 },
    ],
  });
  const msg = getErrorMessage(err);
  assert.match(msg, /12 درس/);
  assert.match(msg, /3 امتحان/);
});

test('maps PostgreSQL 42703 and 42P01 errors to خطأ في اتصال البيانات with code instead of raw JSON', () => {
  const colErr = normalizeError({
    code: '42703',
    message: 'column staff_profiles.id does not exist',
  });
  assert.equal(colErr.code, 'DATA_CONNECTION_ERROR');
  assert.equal(colErr.details?.rawCode, '42703');
  const colMsg = getErrorMessage(colErr);
  assert.match(colMsg, /خطأ في اتصال البيانات/);
  assert.match(colMsg, /42703/);
  assert.doesNotMatch(colMsg, /column staff_profiles\.id/);

  const tblErr = normalizeError({
    code: '42P01',
    message: 'relation "public.missing_table" does not exist',
  });
  assert.equal(tblErr.code, 'DATA_CONNECTION_ERROR');
  assert.equal(tblErr.details?.rawCode, '42P01');
  const tblMsg = getErrorMessage(tblErr);
  assert.match(tblMsg, /خطأ في اتصال البيانات/);
  assert.match(tblMsg, /42P01/);

  const wrappedJsonErr = normalizeError(
    new Error('{"code":"42703","message":"column allowed_link_domains.id does not exist"}')
  );
  assert.equal(wrappedJsonErr.code, 'DATA_CONNECTION_ERROR');
  assert.match(getErrorMessage(wrappedJsonErr), /خطأ في اتصال البيانات \(42703\)/);

  const authErr = normalizeError({ message: 'Invalid login credentials', code: 'invalid_credentials' });
  assert.equal(authErr.code, 'INVALID_CREDENTIALS');
  assert.match(getErrorMessage(authErr), /غير صحيحة/);
});
