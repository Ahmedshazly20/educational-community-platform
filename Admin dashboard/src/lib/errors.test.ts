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
