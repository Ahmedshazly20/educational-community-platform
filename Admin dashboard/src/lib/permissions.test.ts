import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessPath,
  getVisibleNavItems,
  hasPermission,
  requiresMfa,
} from './permissions';

test('admin satisfies every role check and requires MFA', () => {
  assert.equal(hasPermission(['admin'], 'grading:approve'), true);
  assert.equal(hasPermission(['admin'], 'year_end:manage'), true);
  assert.equal(requiresMfa(['admin']), true);
  assert.equal(requiresMfa(['payments_reviewer']), true);
  assert.equal(requiresMfa(['content']), false);
});

test('grader only sees dashboard and grading, cannot approve or read students', () => {
  const navIds = getVisibleNavItems(['grader']).map((n) => n.id);
  assert.deepEqual(navIds, ['dashboard', 'grading']);
  assert.equal(hasPermission(['grader'], 'grading:export_import'), true);
  assert.equal(hasPermission(['grader'], 'grading:approve'), false);
  assert.equal(hasPermission(['grader'], 'students:read'), false);
  assert.equal(canAccessPath(['grader'], '/students'), false);
  assert.equal(canAccessPath(['grader'], '/grading'), true);
});

test('no-role user gets empty nav and is denied every route', () => {
  assert.deepEqual(getVisibleNavItems([]), []);
  assert.equal(canAccessPath([], '/'), false);
  assert.equal(canAccessPath([], '/content'), false);
});

test('support can reset session and update student location, not approve payments or grant subscriptions', () => {
  assert.equal(hasPermission(['support'], 'students:reset_session'), true);
  assert.equal(hasPermission(['support'], 'students:location'), true);
  assert.equal(hasPermission(['support'], 'payments:review'), false);
  assert.equal(hasPermission(['support'], 'subscriptions:grant'), false);
});
