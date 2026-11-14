export type StaffRole =
  | 'admin'
  | 'students_manager'
  | 'payments_reviewer'
  | 'support'
  | 'content'
  | 'exams'
  | 'grader';

export type LessonStatus = 'draft' | 'published' | 'archived';
export type LessonItemType = 'article' | 'link' | 'quick_questions';
export type LinkKind = 'video' | 'document';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';
export type ExamStatus = 'draft' | 'published' | 'archived';
export type QuestionType = 'mcq' | 'essay';
export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted';

export type CourseIconKey =
  | 'atom'
  | 'flask'
  | 'book'
  | 'calculator'
  | 'globe'
  | 'dna'
  | 'scroll'
  | 'languages'
  | 'compass'
  | 'cpu';

export interface StaffProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  roles: StaffRole[];
}

export interface Governorate {
  id: string;
  name_ar: string;
  sort_order: number;
}

export interface Administration {
  id: string;
  governorate_id: string;
  name_ar: string;
  is_active: boolean;
}

export interface Stage {
  id: string;
  name_ar: string;
  sort_order: number;
}

export interface Track {
  id: string;
  stage_id: string;
  name_ar: string;
  is_active: boolean;
  sort_order: number;
}

export interface Term {
  id: string;
  name_ar: string;
  sort_order: number;
  access_ends_at: string | null;
}

export interface Course {
  id: string;
  name_ar: string;
  icon_key: CourseIconKey;
  sort_order: number;
  is_active: boolean;
}

export interface TrackCourse {
  track_id: string;
  course_id: string;
  sort_order: number;
}

export interface AllowedLinkDomain {
  id: string;
  domain: string;
  kind: LinkKind;
  is_active: boolean;
}

export interface Lesson {
  id: string;
  course_id: string;
  term_id: string;
  title: string;
  summary: string | null;
  sort_order: number;
  status: LessonStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonWithContext extends Lesson {
  course_name: string;
  term_name: string;
  tracks: Array<{ track_id: string; track_name: string; stage_id: string; stage_name: string }>;
  items_count: number;
  item_types: LessonItemType[];
}

export interface QuickQuestionOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface QuickQuestion {
  id: string;
  item_id: string;
  prompt: string;
  explanation: string | null;
  sort_order: number;
  options: QuickQuestionOption[];
}

export interface LessonItem {
  id: string;
  lesson_id: string;
  item_type: LessonItemType;
  title: string;
  sort_order: number;
  body_json: Record<string, unknown> | null;
  body_html: string | null;
  url: string | null;
  link_kind: LinkKind | null;
  android_only: boolean;
  quick_questions?: QuickQuestion[];
}

export interface Plan {
  id: string;
  track_id: string;
  term_id: string;
  price_egp: number;
  is_active: boolean;
  created_at: string;
}

export interface Subscription {
  id: string;
  student_id: string;
  student_name?: string;
  student_phone?: string;
  track_id: string;
  track_name?: string;
  stage_id?: string;
  stage_name?: string;
  term_id: string;
  term_name?: string;
  price_paid_egp: number;
  starts_at: string;
  ends_at: string;
  status: SubscriptionStatus;
  payment_request_id: string | null;
  granted_by: string | null;
  grant_note: string | null;
  created_at: string;
}

export interface PaymentQueueRow {
  id: string;
  student_id: string;
  student_name: string;
  student_phone: string;
  governorate_name: string;
  track_id: string;
  track_name: string;
  term_id: string;
  term_name: string;
  term_access_ends_at: string | null;
  amount_egp: number;
  sender_phone: string;
  proof_path: string | null;
  status: PaymentStatus;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  student_trial_ends_at: string;
  student_active_subscriptions_count: number;
  student_previous_requests_count: number;
}

export interface StudentOverviewRow {
  id: string;
  full_name: string;
  phone: string;
  guardian_phone: string | null;
  governorate_id: string;
  governorate_name: string;
  administration_id: string | null;
  administration_name: string | null;
  stage_id: string;
  stage_name: string;
  track_id: string;
  track_name: string;
  trial_ends_at: string;
  trial_days_left: number;
  active_subscriptions_count: number;
  is_blocked: boolean;
  block_reason: string | null;
  created_at: string;
}

export interface DeviceSession {
  id: string;
  student_id: string;
  device_id: string;
  device_label: string;
  platform: 'android' | 'web';
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
}

export interface StudentItemProgress {
  item_id: string;
  item_title: string;
  lesson_id: string;
  lesson_title: string;
  completed_at: string;
}

export interface StudentQuickAnswer {
  id: string;
  question_id: string;
  prompt: string;
  selected_option_text: string;
  is_correct: boolean;
  answered_at: string;
}

export interface Exam {
  id: string;
  course_id: string;
  term_id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  late_entry_minutes: number;
  disconnect_grace_seconds: number;
  status: ExamStatus;
  created_at: string;
  updated_at: string;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  option_text: string;
  is_correct: boolean;
  sort_order: number;
}

export interface ExamQuestion {
  id: string;
  exam_id: string;
  position: number;
  question_type: QuestionType;
  prompt_html: string;
  points: number;
  options: QuestionOption[];
}

export interface ExamSession {
  id: string;
  exam_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
}

export interface SessionAudience {
  id: string;
  session_id: string;
  governorate_id: string | null;
  administration_id: string | null;
  track_id: string | null;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  session_id: string;
  student_id: string;
  student_name?: string;
  status: AttemptStatus;
  started_at: string;
  submitted_at: string | null;
}

export interface ExamSessionStatRow {
  session_id: string;
  exam_id: string;
  session_name: string;
  starts_at: string;
  ends_at: string;
  eligible_count: number;
  total_attempts: number;
  in_progress_count: number;
  submitted_count: number;
  auto_submitted_count: number;
}

export interface QuestionStatRow {
  question_id: string;
  position: number;
  question_type: QuestionType;
  prompt_html: string;
  points: number;
  attempts_count: number;
  answered_count: number;
  correct_count: number;
  correct_pct: number | null;
  avg_essay_score: number | null;
}

export interface GradingBatch {
  id: string;
  exam_id: string;
  exported_by: string;
  exported_by_name?: string;
  exported_at: string;
  imported_at: string | null;
  ai_graded: boolean;
  rows_count: number;
}

export interface GradingExportRow {
  answer_code: string;
  question_position: number;
  question_text: string;
  answer_text: string;
  max_points: number;
  score: number | null;
}

export interface GradeImportRow {
  answer_code: string;
  question_position: number;
  score: number;
}

export interface ImportErrorDetail {
  row: number;
  code: string;
  message?: string;
}

export interface ExamResultRow {
  id: string;
  exam_id: string;
  exam_title?: string;
  attempt_id: string;
  student_id: string;
  student_name?: string;
  student_phone?: string;
  mcq_score: number;
  essay_score: number;
  total_score: number;
  max_score: number;
  percentage: number;
  ai_graded: boolean;
  approved_at: string;
}

export interface EssayAnswerAdminRow {
  answer_id: string;
  attempt_id: string;
  student_id: string;
  student_name: string;
  question_id: string;
  question_position: number;
  question_text: string;
  answer_text: string;
  max_points: number;
  score: number;
  adjust_reason: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  track_id: string | null;
  track_name?: string | null;
  governorate_id: string | null;
  governorate_name?: string | null;
  recipients_count: number;
  sent_by: string;
  sender_name?: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface YearEndReport {
  id: string;
  academic_year: string;
  pdf_path: string;
  registered_by: string;
  registered_at: string;
  purged_at: string | null;
}

export interface DashboardSummary {
  pendingPaymentsCount: number;
  oldestPendingDays: number | null;
  studentsInTrialCount: number;
  trialsEnding7DaysCount: number;
  activeSubscriptionsByTerm: Array<{ term_id: string; term_name: string; count: number }>;
  blockedStudentsCount: number;
  upcomingSessions24hCount: number;
  attemptsInProgressCount: number;
  examsAwaitingGradingCount: number;
  lessonsPublishedCount: number;
  lessonsDraftCount: number;
  termsMissingAccessEnd: Term[];
  recentAudit: AuditLogEntry[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}
