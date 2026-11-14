import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAdminApi } from './mockAdapter';
import { AppError } from '../../lib/errors';

test('MockAdminApi enforces role permissions, MFA, and LAST_ADMIN protection', async () => {
  const api = new MockAdminApi();

  // Grader cannot approve grading or read students
  await api.signIn('grader@thanawya.edu.eg', 'pass');
  await assert.rejects(() => api.approveGrading('exam-2'), (e: unknown) => e instanceof AppError && e.code === 'NOT_ALLOWED');
  await assert.rejects(() => api.getStudents({}), (e: unknown) => e instanceof AppError && e.code === 'NOT_ALLOWED');

  // Admin requires MFA
  await api.signIn('admin@thanawya.edu.eg', 'pass');
  await assert.rejects(() => api.getDashboardSummary(), (e: unknown) => e instanceof AppError && e.code === 'NOT_ALLOWED');
  await api.verifyMfa('123456');

  // Cannot remove admin role from last admin
  await assert.rejects(
    () => api.updateStaffRoles('staff-admin', ['content']),
    (e: unknown) => e instanceof AppError && e.code === 'LAST_ADMIN'
  );
});

test('MockAdminApi enforces lesson publishing, link domains, and student access rules', async () => {
  const api = new MockAdminApi();
  await api.signIn('content@thanawya.edu.eg', 'pass');

  // Empty lesson cannot publish
  const lesson = await api.createLesson({
    course_id: 'course-phys',
    term_id: 'term-1',
    title: 'درس اختباري',
    summary: null,
  });
  await assert.rejects(
    () => api.setLessonStatus(lesson.id, 'published'),
    (e: unknown) => e instanceof AppError && e.code === 'LESSON_HAS_NO_ITEMS'
  );

  // HTTP link rejected
  await assert.rejects(
    () =>
      api.createLessonItem({
        lesson_id: lesson.id,
        item_type: 'link',
        title: 'رابط غير آمن',
        url: 'http://youtube.com/watch?v=1',
      }),
    (e: unknown) => e instanceof AppError && e.code === 'LINK_MUST_BE_HTTPS'
  );

  // Disallowed lookalike domain rejected
  await assert.rejects(
    () =>
      api.createLessonItem({
        lesson_id: lesson.id,
        item_type: 'link',
        title: 'رابط مزيف',
        url: 'https://youtube.com.evil.com/watch?v=1',
      }),
    (e: unknown) => e instanceof AppError && e.code === 'LINK_DOMAIN_NOT_ALLOWED'
  );

  // Valid YouTube link sets android_only=true and allows publish
  const ytItem = await api.createLessonItem({
    lesson_id: lesson.id,
    item_type: 'link',
    title: 'فيديو شرح',
    url: 'https://youtube.com/watch?v=valid',
  });
  assert.equal(ytItem.android_only, true);
  assert.equal(ytItem.link_kind, 'video');

  const pub = await api.setLessonStatus(lesson.id, 'published');
  assert.equal(pub.status, 'published');

  // Student 5 has expired trial -> no access, Student 1 has active subscription -> access
  assert.equal(await api.checkStudentAccessMock('stu-5', 'term-1'), false);
  assert.equal(await api.checkStudentAccessMock('stu-1', 'term-1'), true);
});

test('MockAdminApi enforces full grading lifecycle: export -> import -> admin approve -> adjust', async () => {
  const api = new MockAdminApi();

  // Grader exports and imports anonymous batch
  await api.signIn('grader@thanawya.edu.eg', 'pass');
  const { batch, rows } = await api.exportGrading('exam-2');
  assert.equal(rows.length, 2);
  assert.equal('student_name' in (rows[0] ?? {}), false);

  // Unfinished exam cannot be exported
  await assert.rejects(
    () => api.exportGrading('exam-1'),
    (e: unknown) => e instanceof AppError && e.code === 'SESSIONS_NOT_ENDED'
  );

  // Admin cannot approve while answers are ungraded
  await api.signIn('admin@thanawya.edu.eg', 'pass');
  await api.verifyMfa('123456');
  await assert.rejects(
    () => api.approveGrading('exam-2'),
    (e: unknown) => e instanceof AppError && e.code === 'UNGRADED_ANSWERS'
  );

  // Grader imports scores
  await api.signIn('grader@thanawya.edu.eg', 'pass');
  await api.importGrades(
    batch.id,
    rows.map((r) => ({ answer_code: r.answer_code, question_position: r.question_position, score: 4 })),
    true
  );

  // Admin approves grading
  await api.signIn('admin@thanawya.edu.eg', 'pass');
  await api.verifyMfa('123456');
  await api.approveGrading('exam-2');

  const results = await api.getExamResults('exam-2');
  assert.equal(results.length, 2);
  assert.equal(results[0]?.ai_graded, true);

  // Adjust one essay grade and verify recompute
  const answers = await api.listEssayAnswersAdmin('exam-2');
  const target = answers[0];
  assert.ok(target);
  await api.adjustEssayGrade(target.answer_id, 5, 'مراجعة يدوية للإجابة');
  const updatedResults = await api.getExamResults('exam-2');
  const updatedStuRes = updatedResults.find((r) => r.student_id === target.student_id);
  assert.equal(updatedStuRes?.essay_score, 5);
});
