import type {
  ExamSession,
  Governorate,
  SessionAudience,
  StudentOverviewRow,
  Track,
} from '../data/types';

/**
 * Specificity score mirrors the DB audience matching rule:
 * administration_id (more specific than governorate_id) + governorate_id + track_id.
 * Higher score wins; ties between two different sessions create AMBIGUOUS_AUDIENCE.
 */
export function audienceSpecificity(rule: SessionAudience): number {
  let score = 0;
  if (rule.governorate_id) score += 1;
  if (rule.administration_id) score += 2;
  if (rule.track_id) score += 1;
  return score;
}

export function ruleMatchesStudent(
  rule: SessionAudience,
  student: {
    governorate_id: string;
    administration_id: string | null;
    track_id: string;
  }
): boolean {
  if (rule.governorate_id && rule.governorate_id !== student.governorate_id) return false;
  if (rule.administration_id && rule.administration_id !== student.administration_id) return false;
  if (rule.track_id && rule.track_id !== student.track_id) return false;
  return true;
}

export interface AudienceMatchResult {
  matchedSession: ExamSession | null;
  ambiguousSessions: ExamSession[];
}

export function matchSessionForProfile(
  sessions: ReadonlyArray<ExamSession>,
  audiences: ReadonlyArray<SessionAudience>,
  profile: {
    governorate_id: string;
    administration_id: string | null;
    track_id: string;
  }
): AudienceMatchResult {
  const matching = audiences
    .filter((a) => ruleMatchesStudent(a, profile))
    .map((a) => ({ rule: a, score: audienceSpecificity(a) }));

  if (matching.length === 0) {
    return { matchedSession: null, ambiguousSessions: [] };
  }

  const maxScore = Math.max(...matching.map((m) => m.score));
  const topSessionIds = Array.from(
    new Set(matching.filter((m) => m.score === maxScore).map((m) => m.rule.session_id))
  );

  const matchedSessions = sessions.filter((s) => topSessionIds.includes(s.id));
  if (matchedSessions.length > 1) {
    return { matchedSession: null, ambiguousSessions: matchedSessions };
  }
  return {
    matchedSession: matchedSessions[0] ?? null,
    ambiguousSessions: [],
  };
}

export interface CoverageCell {
  governorateId: string;
  governorateName: string;
  trackId: string;
  trackName: string;
  sessionName: string | null;
  sessionId: string | null;
  ambiguous: boolean;
  eligibleStudentsCount: number;
}

export interface ExamCoverageSummary {
  cells: CoverageCell[];
  sessionCounts: Array<{ sessionId: string; sessionName: string; count: number }>;
  uncoveredStudents: StudentOverviewRow[];
  hasAmbiguity: boolean;
}

export function computeExamCoveragePreview(params: {
  sessions: ReadonlyArray<ExamSession>;
  audiences: ReadonlyArray<SessionAudience>;
  eligibleCourseTrackIds: ReadonlyArray<string>;
  governorates: ReadonlyArray<Governorate>;
  tracks: ReadonlyArray<Track>;
  students: ReadonlyArray<StudentOverviewRow>;
}): ExamCoverageSummary {
  const { sessions, audiences, eligibleCourseTrackIds, governorates, tracks, students } = params;

  const eligibleTracks = tracks.filter((t) => eligibleCourseTrackIds.includes(t.id));
  const eligibleStudents = students.filter(
    (s) => !s.is_blocked && eligibleCourseTrackIds.includes(s.track_id)
  );

  const sessionMap = new Map<string, number>();
  for (const s of sessions) sessionMap.set(s.id, 0);

  const uncoveredStudents: StudentOverviewRow[] = [];
  let hasAmbiguity = false;

  for (const student of eligibleStudents) {
    const match = matchSessionForProfile(sessions, audiences, student);
    if (match.ambiguousSessions.length > 0) {
      hasAmbiguity = true;
    } else if (match.matchedSession) {
      sessionMap.set(
        match.matchedSession.id,
        (sessionMap.get(match.matchedSession.id) ?? 0) + 1
      );
    } else {
      uncoveredStudents.push(student);
    }
  }

  // Pairwise rule ambiguity check even when no student currently sits in the intersection
  for (let i = 0; i < audiences.length; i++) {
    for (let j = i + 1; j < audiences.length; j++) {
      const a = audiences[i];
      const b = audiences[j];
      if (!a || !b || a.session_id === b.session_id) continue;
      if (audienceSpecificity(a) !== audienceSpecificity(b)) continue;
      const govOverlap = !a.governorate_id || !b.governorate_id || a.governorate_id === b.governorate_id;
      const adminOverlap =
        !a.administration_id || !b.administration_id || a.administration_id === b.administration_id;
      const trackOverlap = !a.track_id || !b.track_id || a.track_id === b.track_id;
      if (govOverlap && adminOverlap && trackOverlap) {
        hasAmbiguity = true;
      }
    }
  }

  const cells: CoverageCell[] = [];
  for (const gov of governorates) {
    for (const track of eligibleTracks) {
      const match = matchSessionForProfile(sessions, audiences, {
        governorate_id: gov.id,
        administration_id: null,
        track_id: track.id,
      });
      const count = eligibleStudents.filter(
        (s) => s.governorate_id === gov.id && s.track_id === track.id
      ).length;
      if (count > 0 || match.matchedSession || match.ambiguousSessions.length > 0) {
        cells.push({
          governorateId: gov.id,
          governorateName: gov.name_ar,
          trackId: track.id,
          trackName: track.name_ar,
          sessionName: match.matchedSession?.name ?? null,
          sessionId: match.matchedSession?.id ?? null,
          ambiguous: match.ambiguousSessions.length > 0,
          eligibleStudentsCount: count,
        });
      }
    }
  }

  return {
    cells,
    sessionCounts: sessions.map((s) => ({
      sessionId: s.id,
      sessionName: s.name,
      count: sessionMap.get(s.id) ?? 0,
    })),
    uncoveredStudents,
    hasAmbiguity,
  };
}
