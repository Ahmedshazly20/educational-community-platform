import type {
  Administration,
  AllowedLinkDomain,
  Announcement,
  AuditLogEntry,
  Course,
  CourseIconKey,
  DashboardSummary,
  DeviceSession,
  EssayAnswerAdminRow,
  Exam,
  ExamAttempt,
  ExamQuestion,
  ExamResultRow,
  ExamSession,
  ExamSessionStatRow,
  Governorate,
  GradeImportRow,
  GradingBatch,
  GradingExportRow,
  Lesson,
  LessonItem,
  LessonItemType,
  LessonStatus,
  LessonWithContext,
  LinkKind,
  PaginatedResult,
  PaymentQueueRow,
  PaymentStatus,
  Plan,
  QuestionStatRow,
  QuestionType,
  SessionAudience,
  StaffProfile,
  StaffRole,
  Stage,
  StudentItemProgress,
  StudentOverviewRow,
  StudentQuickAnswer,
  Subscription,
  SubscriptionStatus,
  Term,
  Track,
  TrackCourse,
  YearEndReport,
} from './types';

export interface AuthSessionState {
  userId: string;
  email: string;
  profile: StaffProfile | null;
  roles: StaffRole[];
  mfaRequired: boolean;
  mfaVerified: boolean;
  mfaEnrolled: boolean;
  verifiedTotpFactorId?: string | null;
  aalCurrentLevel?: 'aal1' | 'aal2' | null;
  aalNextLevel?: 'aal1' | 'aal2' | null;
}

export interface MfaEnrollmentData {
  factorId: string;
  qrCode: string;
  secret: string;
  uri?: string;
}

export interface LessonsFilter {
  stageId?: string;
  trackId?: string;
  courseId?: string;
  termId?: string;
  status?: LessonStatus | 'all';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SubscriptionsFilter {
  status?: SubscriptionStatus | 'all';
  termId?: string;
  trackId?: string;
  stageId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaymentQueueFilter {
  status: PaymentStatus;
  termId?: string;
  trackId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface StudentsFilter {
  search?: string;
  governorateId?: string;
  administrationId?: string;
  stageId?: string;
  trackId?: string;
  status?: 'all' | 'trial' | 'subscribed' | 'expired' | 'blocked';
  fromDate?: string;
  toDate?: string;
  sortBy?: 'created_at' | 'full_name' | 'trial_ends_at';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface AuditFilter {
  action?: string;
  entityType?: string;
  actorId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportsFilter {
  fromDate?: string;
  toDate?: string;
  termId?: string;
  trackId?: string;
  stageId?: string;
}

export interface DependencyCheckResult {
  canDelete: boolean;
  dependencies: Array<{ label: string; count: number }>;
}

export interface LessonDetailData {
  lesson: Lesson;
  course: Course;
  term: Term;
  tracks: Array<{ track: Track; stage: Stage }>;
  items: LessonItem[];
}

export interface ExamDetailData {
  exam: Exam;
  course: Course;
  term: Term;
  tracks: Array<{ track: Track; stage: Stage }>;
  questions: ExamQuestion[];
  sessions: ExamSession[];
  audiences: SessionAudience[];
  isLocked: boolean;
  isApproved: boolean;
}

export interface ReportBundle {
  truncated: boolean;
  totalFetched: number;
  payments: PaymentQueueRow[];
  subscriptions: Subscription[];
  students: StudentOverviewRow[];
  lessons: LessonWithContext[];
  exams: Exam[];
  results: ExamResultRow[];
  itemProgressCount: number;
  quickAnswersStats: { total: number; correct: number };
}

export interface AdminApi {
  // Auth & MFA
  getCurrentSession(): Promise<AuthSessionState | null>;
  signIn(email: string, password: string): Promise<AuthSessionState>;
  enrollMfa(): Promise<MfaEnrollmentData>;
  verifyMfa(code: string, factorId?: string): Promise<AuthSessionState>;
  signOut(): Promise<void>;

  // Dashboard
  getDashboardSummary(): Promise<DashboardSummary>;

  // Reference / Academic Structure
  getGovernorates(): Promise<Governorate[]>;
  createGovernorate(input: { name_ar: string; sort_order: number }): Promise<Governorate>;
  updateGovernorate(id: string, input: { name_ar: string; sort_order: number }): Promise<Governorate>;
  deleteGovernorate(id: string): Promise<void>;

  getAdministrations(governorateId?: string): Promise<Administration[]>;
  createAdministration(input: {
    governorate_id: string;
    name_ar: string;
    is_active: boolean;
  }): Promise<Administration>;
  updateAdministration(id: string, input: { name_ar: string; is_active: boolean }): Promise<Administration>;
  deleteAdministration(id: string): Promise<void>;
  bulkImportAdministrations(
    rows: Array<{ governorate: string; administration: string }>
  ): Promise<{ inserted: number; skippedDuplicates: number; unknownGovernorates: string[] }>;

  getStages(): Promise<Stage[]>;
  createStage(input: { name_ar: string; sort_order: number }): Promise<Stage>;
  updateStage(id: string, input: { name_ar: string; sort_order: number }): Promise<Stage>;
  reorderStages(items: Array<{ id: string; name_ar: string; sort_order: number }>): Promise<void>;
  checkStageDependencies(id: string): Promise<DependencyCheckResult>;
  deleteStage(id: string): Promise<void>;

  getTracks(stageId?: string): Promise<Track[]>;
  createTrack(input: {
    stage_id: string;
    name_ar: string;
    is_active: boolean;
    sort_order: number;
  }): Promise<Track>;
  updateTrack(
    id: string,
    input: { stage_id: string; name_ar: string; is_active: boolean; sort_order: number }
  ): Promise<Track>;
  checkTrackDependencies(id: string): Promise<DependencyCheckResult>;
  deleteTrack(id: string): Promise<void>;

  getCourses(): Promise<Course[]>;
  createCourse(input: {
    name_ar: string;
    icon_key: CourseIconKey;
    sort_order: number;
    is_active: boolean;
  }): Promise<Course>;
  updateCourse(
    id: string,
    input: { name_ar: string; icon_key: CourseIconKey; sort_order: number; is_active: boolean }
  ): Promise<Course>;
  checkCourseDependencies(id: string): Promise<DependencyCheckResult>;
  deleteCourse(id: string): Promise<void>;

  getTrackCourses(): Promise<TrackCourse[]>;
  linkTrackCourse(input: { track_id: string; course_id: string; sort_order: number }): Promise<TrackCourse>;
  unlinkTrackCourse(trackId: string, courseId: string): Promise<void>;

  getTerms(): Promise<Term[]>;
  createTerm(input: { name_ar: string; sort_order: number; access_ends_at: string | null }): Promise<Term>;
  updateTerm(
    id: string,
    input: { name_ar: string; sort_order: number; access_ends_at: string | null }
  ): Promise<Term>;
  checkTermDependencies(id: string): Promise<DependencyCheckResult>;
  deleteTerm(id: string): Promise<void>;

  getAllowedLinkDomains(): Promise<AllowedLinkDomain[]>;
  createAllowedLinkDomain(input: {
    domain: string;
    kind: LinkKind;
    is_active: boolean;
  }): Promise<AllowedLinkDomain>;
  updateAllowedLinkDomain(
    id: string,
    input: { domain: string; kind: LinkKind; is_active: boolean }
  ): Promise<AllowedLinkDomain>;
  deleteAllowedLinkDomain(id: string): Promise<void>;

  // Content Management
  getLessons(filter: LessonsFilter): Promise<PaginatedResult<LessonWithContext>>;
  getLessonDetail(lessonId: string): Promise<LessonDetailData>;
  createLesson(input: {
    course_id: string;
    term_id: string;
    title: string;
    summary: string | null;
  }): Promise<Lesson>;
  updateLessonMeta(
    lessonId: string,
    input: { title: string; summary: string | null }
  ): Promise<Lesson>;
  setLessonStatus(lessonId: string, status: LessonStatus): Promise<Lesson>;
  reorderLessons(
    rows: Array<{ id: string; course_id: string; term_id: string; title: string; sort_order: number }>
  ): Promise<void>;
  getLessonDeleteImpact(lessonId: string): Promise<{ progressCount: number; answersCount: number }>;
  deleteLesson(lessonId: string): Promise<void>;

  createLessonItem(input: {
    lesson_id: string;
    item_type: LessonItemType;
    title: string;
    body_json?: Record<string, unknown> | null;
    body_html?: string | null;
    url?: string | null;
  }): Promise<LessonItem>;
  updateLessonItem(
    itemId: string,
    input: {
      title: string;
      body_json?: Record<string, unknown> | null;
      body_html?: string | null;
      url?: string | null;
    }
  ): Promise<LessonItem>;
  reorderLessonItems(
    rows: Array<{
      id: string;
      lesson_id: string;
      item_type: LessonItemType;
      title: string;
      sort_order: number;
    }>
  ): Promise<void>;
  getLessonItemDeleteImpact(itemId: string): Promise<{ progressCount: number; answersCount: number }>;
  deleteLessonItem(itemId: string): Promise<void>;

  upsertQuickQuestion(input: {
    id?: string;
    item_id: string;
    prompt: string;
    explanation: string | null;
    options: Array<{ id?: string; option_text: string; is_correct: boolean; sort_order: number }>;
  }): Promise<void>;
  deleteQuickQuestion(questionId: string): Promise<void>;
  reorderQuickQuestions(
    rows: Array<{ id: string; item_id: string; prompt: string; sort_order: number }>
  ): Promise<void>;

  uploadContentMedia(file: File): Promise<{ publicUrl: string; path: string }>;
  deleteContentMedia(path: string): Promise<void>;

  // Pricing & Subscriptions
  getPlans(): Promise<Plan[]>;
  createPlan(input: {
    track_id: string;
    term_id: string;
    price_egp: number;
    is_active: boolean;
  }): Promise<Plan>;
  updatePlan(
    id: string,
    input: { price_egp: number; is_active: boolean }
  ): Promise<Plan>;
  deletePlan(id: string): Promise<void>;

  getSubscriptions(filter: SubscriptionsFilter): Promise<PaginatedResult<Subscription>>;
  grantSubscription(input: {
    student_id: string;
    term_id: string;
    ends_at: string;
    note?: string;
  }): Promise<Subscription>;

  // Payments
  getPaymentQueue(filter: PaymentQueueFilter): Promise<PaginatedResult<PaymentQueueRow>>;
  getPaymentProofSignedUrl(proofPath: string): Promise<string>;
  approvePayment(requestId: string, endsAtOverride?: string | null): Promise<Subscription>;
  rejectPayment(requestId: string, reason: string): Promise<void>;

  // Students
  getStudents(filter: StudentsFilter): Promise<PaginatedResult<StudentOverviewRow>>;
  getStudentDetail(studentId: string): Promise<{
    student: StudentOverviewRow;
    subscriptions: Subscription[];
    payments: PaymentQueueRow[];
  }>;
  getStudentActivity(studentId: string): Promise<{
    progress: StudentItemProgress[];
    quickAnswers: StudentQuickAnswer[];
  }>;
  getStudentExams(studentId: string): Promise<{
    attempts: ExamAttempt[];
    results: ExamResultRow[];
  }>;
  getStudentDevices(studentId: string): Promise<DeviceSession[]>;
  extendTrial(studentId: string, days: number): Promise<void>;
  setStudentBlocked(studentId: string, blocked: boolean, reason?: string): Promise<void>;
  changeStudentTrack(studentId: string, trackId: string): Promise<void>;
  updateStudentLocation(
    studentId: string,
    governorateId: string,
    administrationId: string | null
  ): Promise<void>;
  resetStudentSession(studentId: string): Promise<void>;

  // Exams
  getExams(filter?: { courseId?: string; termId?: string; status?: string }): Promise<Exam[]>;
  getExamDetail(examId: string): Promise<ExamDetailData>;
  createExam(input: {
    course_id: string;
    term_id: string;
    title: string;
    description: string | null;
    duration_minutes: number;
    late_entry_minutes: number;
    disconnect_grace_seconds: number;
  }): Promise<Exam>;
  updateExam(
    examId: string,
    input: {
      course_id: string;
      term_id: string;
      title: string;
      description: string | null;
      duration_minutes: number;
      late_entry_minutes: number;
      disconnect_grace_seconds: number;
    }
  ): Promise<Exam>;
  setExamStatus(examId: string, status: 'draft' | 'published' | 'archived'): Promise<Exam>;

  upsertExamQuestion(input: {
    id?: string;
    exam_id: string;
    question_type: QuestionType;
    prompt_html: string;
    points: number;
    options: Array<{ option_text: string; is_correct: boolean; sort_order: number }>;
  }): Promise<ExamQuestion>;
  bulkImportExamQuestions(
    examId: string,
    questions: Array<{
      question_type: QuestionType;
      prompt_html: string;
      points: number;
      options: Array<{ option_text: string; is_correct: boolean; sort_order: number }>;
    }>
  ): Promise<number>;
  deleteExamQuestion(examId: string, questionId: string): Promise<void>;
  reorderExamQuestions(
    examId: string,
    rows: Array<{
      id: string;
      exam_id: string;
      question_type: QuestionType;
      position: number;
      prompt_html: string;
      points: number;
    }>
  ): Promise<void>;

  createExamSession(input: {
    exam_id: string;
    name: string;
    starts_at: string;
    audiences: Array<{
      governorate_id: string | null;
      administration_id: string | null;
      track_id: string | null;
    }>;
  }): Promise<ExamSession>;
  deleteExamSession(examId: string, sessionId: string): Promise<void>;

  getExamMonitoring(examId: string): Promise<ExamSessionStatRow[]>;
  getQuestionStats(examId: string): Promise<QuestionStatRow[]>;

  // Grading & Results
  getGradingBatches(examId: string): Promise<GradingBatch[]>;
  exportGrading(examId: string): Promise<{ batch: GradingBatch; rows: GradingExportRow[] }>;
  importGrades(batchId: string, rows: GradeImportRow[], aiGraded: boolean): Promise<void>;
  approveGrading(examId: string): Promise<void>;
  getExamResults(examId: string): Promise<ExamResultRow[]>;
  listEssayAnswersAdmin(examId: string): Promise<EssayAnswerAdminRow[]>;
  adjustEssayGrade(answerId: string, score: number, reason: string): Promise<void>;

  // Announcements
  getAnnouncements(filter?: { page?: number; pageSize?: number }): Promise<PaginatedResult<Announcement>>;
  countAnnouncementRecipients(trackId: string | null, governorateId: string | null): Promise<number>;
  sendAnnouncement(input: {
    title: string;
    body: string;
    track_id: string | null;
    governorate_id: string | null;
  }): Promise<Announcement>;

  // Reports
  getReportsBundle(filter: ReportsFilter): Promise<ReportBundle>;

  // Staff & Roles
  getStaffList(): Promise<StaffProfile[]>;
  createStaffMember(input: {
    email: string;
    full_name: string;
    password: string;
    roles: StaffRole[];
  }): Promise<StaffProfile>;
  updateStaffRoles(staffId: string, roles: StaffRole[]): Promise<void>;
  setStaffActive(staffId: string, isActive: boolean): Promise<void>;

  // Audit Log
  getAuditLog(filter: AuditFilter): Promise<PaginatedResult<AuditLogEntry>>;

  // Year End
  getYearEndReports(): Promise<YearEndReport[]>;
  registerYearEndReport(academicYear: string, pdfPath: string, studentId?: string): Promise<YearEndReport>;
  purgeYearEndDetails(academicYear: string, confirmation: string): Promise<number>;

  // Verification helpers (used in automated acceptance tests on mock adapter)
  checkStudentAccessMock?(studentId: string, termId: string): Promise<boolean>;
  getStudentVisibleLessonsMock?(studentId: string, courseId: string, termId: string): Promise<Lesson[]>;
  createStudentPaymentRequestMock?(studentId: string, termId: string, senderPhone: string): Promise<void>;
  simulateExamSessionStartMock?(sessionId: string): Promise<void>;
  simulateExamSessionsEndMock?(examId: string): Promise<void>;
  resetMockState?(): void;
}
