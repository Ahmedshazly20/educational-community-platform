export const keys = {
  auth: {
    session: ['auth', 'session'] as const,
  },
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
  },
  academic: {
    all: ['academic'] as const,
    governorates: ['academic', 'governorates'] as const,
    administrations: (govId?: string) => ['academic', 'administrations', govId ?? 'all'] as const,
    stages: ['academic', 'stages'] as const,
    tracks: (stageId?: string) => ['academic', 'tracks', stageId ?? 'all'] as const,
    terms: ['academic', 'terms'] as const,
    courses: ['academic', 'courses'] as const,
    trackCourses: ['academic', 'track_courses'] as const,
    allowedDomains: ['academic', 'allowed_domains'] as const,
  },
  content: {
    all: ['content'] as const,
    treeCounts: ['content', 'treeCounts'] as const,
    lessons: (filters: Record<string, unknown>) => ['content', 'lessons', filters] as const,
    lessonDetail: (lessonId: string) => ['content', 'lesson', lessonId] as const,
  },
  pricing: {
    plans: ['pricing', 'plans'] as const,
    subscriptions: (filters: Record<string, unknown>) => ['pricing', 'subscriptions', filters] as const,
  },
  payments: {
    queue: (filters: Record<string, unknown>) => ['payments', 'queue', filters] as const,
  },
  students: {
    list: (filters: Record<string, unknown>) => ['students', 'list', filters] as const,
    detail: (studentId: string) => ['students', 'detail', studentId] as const,
    activity: (studentId: string) => ['students', 'activity', studentId] as const,
    exams: (studentId: string) => ['students', 'exams', studentId] as const,
    devices: (studentId: string) => ['students', 'devices', studentId] as const,
  },
  exams: {
    list: (filters: Record<string, unknown>) => ['exams', 'list', filters] as const,
    detail: (examId: string) => ['exams', 'detail', examId] as const,
    monitoring: (examId: string) => ['exams', 'monitoring', examId] as const,
    stats: (examId: string) => ['exams', 'stats', examId] as const,
  },
  grading: {
    batches: (examId: string) => ['grading', 'batches', examId] as const,
    results: (examId: string) => ['grading', 'results', examId] as const,
    essayAnswers: (examId: string) => ['grading', 'essayAnswers', examId] as const,
  },
  announcements: {
    list: (filters: Record<string, unknown>) => ['announcements', 'list', filters] as const,
    recipientCount: (trackId: string | null, govId: string | null) =>
      ['announcements', 'count', trackId ?? 'all', govId ?? 'all'] as const,
  },
  reports: {
    data: (type: string, filters: Record<string, unknown>) => ['reports', type, filters] as const,
  },
  staff: {
    list: ['staff', 'list'] as const,
  },
  audit: {
    list: (filters: Record<string, unknown>) => ['audit', 'list', filters] as const,
  },
  yearEnd: {
    reports: ['yearEnd', 'reports'] as const,
  },
};
