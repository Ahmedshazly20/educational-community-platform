import type {
  ExamQuestion,
  ExamSession,
  LessonItem,
  SessionAudience,
  TrackCourse,
} from '../data/types';

export interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  errorCode?: string;
}

export interface LessonPublishCheckResult {
  canPublish: boolean;
  checks: ChecklistItem[];
}

export function checkLessonPublishable(items: ReadonlyArray<LessonItem>): LessonPublishCheckResult {
  const hasItems = items.length >= 1;

  const quickItems = items.filter((i) => i.item_type === 'quick_questions');
  const allQuickItemsHaveQuestions = quickItems.every(
    (i) => (i.quick_questions?.length ?? 0) >= 1
  );

  const allQuickQuestionsValid = quickItems.every((i) =>
    (i.quick_questions ?? []).every((q) => {
      const hasEnoughOptions = q.options.length >= 2;
      const correctCount = q.options.filter((o) => o.is_correct).length;
      return hasEnoughOptions && correctCount === 1;
    })
  );

  const checks: ChecklistItem[] = [
    {
      id: 'has_items',
      label: 'يحتوي الدرس على عنصر واحد على الأقل',
      passed: hasItems,
      errorCode: hasItems ? undefined : 'LESSON_HAS_NO_ITEMS',
    },
    {
      id: 'quick_items_not_empty',
      label: 'كل عنصر أسئلة سريعة يحتوي على سؤال واحد على الأقل',
      passed: allQuickItemsHaveQuestions,
      errorCode: allQuickItemsHaveQuestions ? undefined : 'QUICK_QUESTIONS_ITEM_EMPTY',
    },
    {
      id: 'quick_questions_valid',
      label: 'كل سؤال سريع له خياران على الأقل وإجابة صحيحة واحدة فقط',
      passed: allQuickQuestionsValid,
      errorCode: allQuickQuestionsValid ? undefined : 'QUICK_QUESTION_INVALID',
    },
  ];

  return {
    canPublish: checks.every((c) => c.passed),
    checks,
  };
}

export interface ExamPublishCheckResult {
  canPublish: boolean;
  checks: ChecklistItem[];
}

export function checkExamPublishable(params: {
  courseId: string;
  trackCourses: ReadonlyArray<TrackCourse>;
  questions: ReadonlyArray<ExamQuestion>;
  sessions: ReadonlyArray<ExamSession>;
  audiences: ReadonlyArray<SessionAudience>;
  hasAmbiguity: boolean;
}): ExamPublishCheckResult {
  const { courseId, trackCourses, questions, sessions, audiences, hasAmbiguity } = params;

  const courseInTrack = trackCourses.some((tc) => tc.course_id === courseId);
  const hasQuestions = questions.length >= 1;
  const allQuestionsValid = questions.every((q) => {
    if (q.points <= 0) return false;
    if (q.question_type === 'mcq') {
      const correctCount = q.options.filter((o) => o.is_correct).length;
      return q.options.length >= 2 && q.options.length <= 6 && correctCount === 1;
    }
    return q.options.length === 0;
  });

  const hasSessions = sessions.length >= 1;
  const allSessionsHaveAudience =
    sessions.length > 0 &&
    sessions.every((s) => audiences.some((a) => a.session_id === s.id));

  const checks: ChecklistItem[] = [
    {
      id: 'course_in_track',
      label: 'المادة مرتبطة بمسار واحد على الأقل',
      passed: courseInTrack,
      errorCode: courseInTrack ? undefined : 'COURSE_NOT_IN_ANY_TRACK',
    },
    {
      id: 'has_questions',
      label: 'يحتوي الامتحان على سؤال واحد على الأقل',
      passed: hasQuestions,
      errorCode: hasQuestions ? undefined : 'EXAM_HAS_NO_QUESTIONS',
    },
    {
      id: 'questions_valid',
      label: 'جميع الأسئلة مطابقة للشروط (MCQ: 2–6 خيارات وإجابة صحيحة واحدة، مقالي: بدون خيارات)',
      passed: allQuestionsValid,
      errorCode: allQuestionsValid ? undefined : 'MCQ_INVALID',
    },
    {
      id: 'has_sessions',
      label: 'توجد جلسة امتحان واحدة على الأقل',
      passed: hasSessions,
      errorCode: hasSessions ? undefined : 'EXAM_HAS_NO_SESSIONS',
    },
    {
      id: 'sessions_audience',
      label: 'كل جلسة تحتوي على قاعدة جمهور واحدة على الأقل',
      passed: allSessionsHaveAudience,
      errorCode: allSessionsHaveAudience ? undefined : 'SESSION_WITHOUT_AUDIENCE',
    },
    {
      id: 'no_ambiguity',
      label: 'لا يوجد تعارض/غموض في قواعد الجمهور بين الجلسات',
      passed: !hasAmbiguity,
      errorCode: !hasAmbiguity ? undefined : 'AMBIGUOUS_AUDIENCE',
    },
  ];

  return {
    canPublish: checks.every((c) => c.passed),
    checks,
  };
}
