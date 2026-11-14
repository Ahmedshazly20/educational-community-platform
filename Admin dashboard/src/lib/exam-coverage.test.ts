import test from 'node:test';
import assert from 'node:assert/strict';
import { computeExamCoveragePreview, matchSessionForProfile } from './exam-coverage';
import type { ExamSession, SessionAudience } from '../data/types';

const sessions: ExamSession[] = [
  { id: 's1', exam_id: 'e1', name: 'الجيزة عام', starts_at: '2026-12-01T16:00:00Z', ends_at: '2026-12-01T17:00:00Z' },
  { id: 's2', exam_id: 'e1', name: 'الجيزة إدارة الدقي', starts_at: '2026-12-01T18:00:00Z', ends_at: '2026-12-01T19:00:00Z' },
];

test('most specific audience rule wins (governorate + administration beats governorate only)', () => {
  const audiences: SessionAudience[] = [
    { id: 'a1', session_id: 's1', governorate_id: 'giza', administration_id: null, track_id: null },
    { id: 'a2', session_id: 's2', governorate_id: 'giza', administration_id: 'dokki', track_id: null },
  ];

  const matchDokki = matchSessionForProfile(sessions, audiences, {
    governorate_id: 'giza',
    administration_id: 'dokki',
    track_id: 'sci',
  });
  assert.equal(matchDokki.matchedSession?.id, 's2');

  const matchHaram = matchSessionForProfile(sessions, audiences, {
    governorate_id: 'giza',
    administration_id: 'haram',
    track_id: 'sci',
  });
  assert.equal(matchHaram.matchedSession?.id, 's1');
});

test('detects AMBIGUOUS_AUDIENCE when two sessions have equal specificity for overlapping students', () => {
  const audiences: SessionAudience[] = [
    { id: 'a1', session_id: 's1', governorate_id: 'giza', administration_id: null, track_id: null },
    { id: 'a2', session_id: 's2', governorate_id: 'giza', administration_id: null, track_id: null },
  ];

  const summary = computeExamCoveragePreview({
    sessions,
    audiences,
    eligibleCourseTrackIds: ['sci'],
    governorates: [{ id: 'giza', name_ar: 'الجيزة', sort_order: 1 }],
    tracks: [{ id: 'sci', stage_id: 'st1', name_ar: 'علمي علوم', is_active: true, sort_order: 1 }],
    students: [],
  });

  assert.equal(summary.hasAmbiguity, true);
});
