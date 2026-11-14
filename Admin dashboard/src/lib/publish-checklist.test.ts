import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLessonPublishable } from './publish-checklist';
import type { LessonItem } from '../data/types';

test('empty lesson fails publish checklist with LESSON_HAS_NO_ITEMS', () => {
  const res = checkLessonPublishable([]);
  assert.equal(res.canPublish, false);
  assert.equal(res.checks[0]?.errorCode, 'LESSON_HAS_NO_ITEMS');
});

test('quick_questions item without questions or invalid correct option fails checklist', () => {
  const emptyQuickItem: LessonItem = {
    id: 'i1',
    lesson_id: 'l1',
    item_type: 'quick_questions',
    title: 'اختبار سريع',
    sort_order: 1,
    body_json: null,
    body_html: null,
    url: null,
    link_kind: null,
    android_only: false,
    quick_questions: [],
  };
  const r1 = checkLessonPublishable([emptyQuickItem]);
  assert.equal(r1.canPublish, false);
  assert.equal(r1.checks[1]?.errorCode, 'QUICK_QUESTIONS_ITEM_EMPTY');

  const validArticle: LessonItem = {
    id: 'i2',
    lesson_id: 'l1',
    item_type: 'article',
    title: 'مقدمة',
    sort_order: 1,
    body_json: { type: 'doc', content: [] },
    body_html: '<p>أهلا</p>',
    url: null,
    link_kind: null,
    android_only: false,
  };
  assert.equal(checkLessonPublishable([validArticle]).canPublish, true);
});
