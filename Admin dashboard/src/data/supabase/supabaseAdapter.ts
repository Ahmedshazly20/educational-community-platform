import type {
  AdminApi,
  AuditFilter,
  AuthSessionState,
  DependencyCheckResult,
  ExamDetailData,
  LessonDetailData,
  LessonsFilter,
  MfaEnrollmentData,
  PaymentQueueFilter,
  ReportBundle,
  ReportsFilter,
  StudentsFilter,
  SubscriptionsFilter,
} from '../client';
import type {
  Administration,
  AllowedLinkDomain,
  Announcement,
  AttemptStatus,
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
  ExamStatus,
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
  QuestionOption,
  QuestionStatRow,
  QuestionType,
  QuickQuestion,
  QuickQuestionOption,
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
} from '../types';
import { AppError, normalizeError } from '../../lib/errors';
import { diffDaysFromNow } from '../../lib/format';
import { requiresMfa } from '../../lib/permissions';
import { sanitizeArticleHtml } from '../../lib/sanitize';
import { getSupabaseClient } from './supabaseClient';

const ADMINISTER_COLS = 'id, governorate_id, name_ar, is_active';
const GOV_COLS = 'id, name_ar, sort_order';
const STAGE_COLS = 'id, name_ar, sort_order';
const TRACK_COLS = 'id, stage_id, name_ar, is_active, sort_order';
const COURSE_COLS = 'id, name_ar, icon_key, sort_order, is_active';
const TRACK_COURSE_COLS = 'track_id, course_id, sort_order';
const TERM_COLS = 'id, name_ar, sort_order, access_ends_at';
const DOMAIN_COLS = 'domain, kind, created_at';
const LESSON_COLS = 'id, course_id, term_id, title, summary, sort_order, status, published_at, created_by, created_at, updated_at';
const LESSON_ITEM_COLS =
  'id, lesson_id, item_type, title, sort_order, body_json, body_html, url, link_kind, android_only, created_at, updated_at';
const PLAN_COLS = 'id, track_id, term_id, price_egp, is_active, created_at, updated_at';
const SUBSCRIPTION_COLS =
  'id, student_id, track_id, term_id, plan_id, payment_request_id, price_paid_egp, starts_at, ends_at, status, note, created_by, created_at';
const PAYMENT_REQUEST_COLS =
  'id, student_id, track_id, term_id, plan_id, amount_egp, sender_phone, proof_path, status, reviewed_by, reviewed_at, reject_reason, created_at';
const STUDENT_VIEW_COLS =
  'id, full_name, phone, guardian_phone, governorate, administration, track, is_blocked, trial_ends_at, trial_active, active_subscriptions, created_at';
const EXAM_COLS =
  'id, course_id, term_id, title, description, duration_minutes, late_entry_minutes, disconnect_grace_seconds, status, results_approved_at, results_approved_by, created_by, created_at, updated_at';
const EXAM_QUESTION_COLS = 'id, exam_id, position, type, prompt_html, points, created_at';
const EXAM_SESSION_COLS = 'id, exam_id, name, starts_at, ends_at, created_at';
const SESSION_AUDIENCE_COLS = 'id, session_id, governorate_id, administration_id, track_id';
const EXAM_RESULT_COLS =
  'attempt_id, exam_id, student_id, mcq_score, essay_score, total_score, max_score, graded_by_ai, computed_at';
const GRADING_BATCH_COLS =
  'id, exam_id, status, exported_by, exported_at, imported_by, imported_at, ai_graded, rows_imported, approved_by, approved_at';
const ANNOUNCEMENT_COLS = 'id, title, body, track_id, governorate_id, recipients, created_by, created_at';
const AUDIT_LOG_COLS = 'id, at, actor_id, action, entity, entity_id, details';
const DEVICE_SESSION_COLS =
  'id, user_id, auth_session_id, device_id, platform, started_at, last_seen_at, ended_at, end_reason';
const YEAR_END_COLS = 'id, student_id, academic_year, pdf_path, generated_at, details_deleted_at';

function unwrap<T>(data: T | null, error: unknown): T {
  if (error) throw normalizeError(error);
  if (data === null) throw new AppError('UNKNOWN');
  return data;
}

function getRange(page = 1, pageSize = 25): [number, number] {
  const from = Math.max(0, (page - 1) * pageSize);
  return [from, from + pageSize - 1];
}

export function normalizeQrDataUri(rawQr: string): string {
  const trimmed = rawQr.trim();
  if (!trimmed) return '';
  const utf8Prefix = 'data:image/svg+xml;utf-8,';
  if (trimmed.toLowerCase().startsWith(utf8Prefix)) {
    const body = trimmed.slice(utf8Prefix.length);
    if (body.includes('<') || body.includes('#')) {
      return `${utf8Prefix}${encodeURIComponent(body)}`;
    }
    return trimmed;
  }
  if (trimmed.startsWith('data:')) return trimmed;
  return `${utf8Prefix}${encodeURIComponent(trimmed)}`;
}

function mapGovernorate(r: Record<string, unknown>): Governorate {
  return {
    id: String(r.id),
    name_ar: String(r.name_ar ?? ''),
    sort_order: Number(r.sort_order ?? 0),
  };
}

function mapAdministration(r: Record<string, unknown>): Administration {
  return {
    id: String(r.id),
    governorate_id: String(r.governorate_id),
    name_ar: String(r.name_ar ?? ''),
    is_active: Boolean(r.is_active),
  };
}

function mapStage(r: Record<string, unknown>): Stage {
  return {
    id: String(r.id),
    name_ar: String(r.name_ar ?? ''),
    sort_order: Number(r.sort_order ?? 0),
  };
}

function mapTrack(r: Record<string, unknown>): Track {
  return {
    id: String(r.id),
    stage_id: String(r.stage_id),
    name_ar: String(r.name_ar ?? ''),
    is_active: Boolean(r.is_active),
    sort_order: Number(r.sort_order ?? 0),
  };
}

function mapCourse(r: Record<string, unknown>): Course {
  return {
    id: String(r.id),
    name_ar: String(r.name_ar ?? ''),
    icon_key: (r.icon_key as CourseIconKey) ?? 'book',
    sort_order: Number(r.sort_order ?? 0),
    is_active: Boolean(r.is_active),
  };
}

function mapTrackCourse(r: Record<string, unknown>): TrackCourse {
  return {
    track_id: String(r.track_id),
    course_id: String(r.course_id),
    sort_order: Number(r.sort_order ?? 0),
  };
}

function mapTerm(r: Record<string, unknown>): Term {
  return {
    id: String(r.id),
    name_ar: String(r.name_ar ?? ''),
    sort_order: Number(r.sort_order ?? 0),
    access_ends_at: (r.access_ends_at as string | null) ?? null,
  };
}

function mapLesson(r: Record<string, unknown>): Lesson {
  return {
    id: String(r.id),
    course_id: String(r.course_id),
    term_id: String(r.term_id),
    title: String(r.title ?? ''),
    summary: (r.summary as string | null) ?? null,
    sort_order: Number(r.sort_order ?? 0),
    status: r.status as LessonStatus,
    published_at: (r.published_at as string | null) ?? null,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

function mapLessonItem(r: Record<string, unknown>): LessonItem {
  const rawQuestions = (r.quick_questions as Array<Record<string, unknown>> | undefined) ?? undefined;
  const quick_questions: QuickQuestion[] | undefined = rawQuestions
    ? rawQuestions
        .map((q) => {
          const rawOpts = (q.quick_question_options as Array<Record<string, unknown>> | undefined) ?? [];
          const options: QuickQuestionOption[] = rawOpts
            .map((o) => ({
              id: String(o.id),
              question_id: String(o.question_id),
              option_text: String(o.text ?? ''),
              is_correct: Boolean(o.is_correct),
              sort_order: Number(o.sort_order ?? 0),
            }))
            .sort((a, b) => a.sort_order - b.sort_order);
          return {
            id: String(q.id),
            item_id: String(q.item_id),
            prompt: String(q.prompt ?? ''),
            explanation: (q.explanation as string | null) ?? null,
            sort_order: Number(q.sort_order ?? 0),
            options,
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order)
    : undefined;

  return {
    id: String(r.id),
    lesson_id: String(r.lesson_id),
    item_type: r.item_type as LessonItemType,
    title: String(r.title ?? ''),
    sort_order: Number(r.sort_order ?? 0),
    body_json: (r.body_json as Record<string, unknown> | null) ?? null,
    body_html: (r.body_html as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    link_kind: (r.link_kind as LinkKind | null) ?? null,
    android_only: Boolean(r.android_only),
    quick_questions,
  };
}

function mapPlan(r: Record<string, unknown>): Plan {
  return {
    id: String(r.id),
    track_id: String(r.track_id),
    term_id: String(r.term_id),
    price_egp: Number(r.price_egp ?? 0),
    is_active: Boolean(r.is_active),
    created_at: String(r.created_at ?? ''),
  };
}

function mapExam(r: Record<string, unknown>): Exam {
  return {
    id: String(r.id),
    course_id: String(r.course_id),
    term_id: String(r.term_id),
    title: String(r.title ?? ''),
    description: (r.description as string | null) ?? null,
    duration_minutes: Number(r.duration_minutes ?? 0),
    late_entry_minutes: Number(r.late_entry_minutes ?? 0),
    disconnect_grace_seconds: Number(r.disconnect_grace_seconds ?? 0),
    status: r.status as ExamStatus,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

function mapExamQuestion(r: Record<string, unknown>): ExamQuestion {
  const rawOptions = (r.question_options as Array<Record<string, unknown>> | undefined) ?? [];
  const options: QuestionOption[] = rawOptions
    .map((o) => ({
      id: String(o.id),
      question_id: String(o.question_id),
      option_text: String(o.text_html ?? ''),
      is_correct: Boolean(o.is_correct),
      sort_order: Number(o.position ?? 0),
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    id: String(r.id),
    exam_id: String(r.exam_id),
    position: Number(r.position ?? 0),
    question_type: r.type as QuestionType,
    prompt_html: String(r.prompt_html ?? ''),
    points: Number(r.points ?? 0),
    options,
  };
}

function mapSessionAudience(r: Record<string, unknown>): SessionAudience {
  return {
    id: String(r.id),
    session_id: String(r.session_id),
    governorate_id: r.governorate_id != null ? String(r.governorate_id) : null,
    administration_id: r.administration_id != null ? String(r.administration_id) : null,
    track_id: r.track_id != null ? String(r.track_id) : null,
  };
}

function mapGradingBatch(r: Record<string, unknown>, exporterName?: string): GradingBatch {
  return {
    id: String(r.id),
    exam_id: String(r.exam_id),
    exported_by: r.exported_by != null ? String(r.exported_by) : '',
    exported_by_name: exporterName,
    exported_at: String(r.exported_at ?? ''),
    imported_at: (r.imported_at as string | null) ?? null,
    ai_graded: Boolean(r.ai_graded),
    rows_count: Number(r.rows_imported ?? 0),
  };
}

function mapExamResult(
  r: Record<string, unknown>,
  studentInfo?: { full_name?: string; phone?: string },
  examTitle?: string
): ExamResultRow {
  const mcq = Number(r.mcq_score ?? 0);
  const essay = Number(r.essay_score ?? 0);
  const total = Number(r.total_score ?? mcq + essay);
  const max = Number(r.max_score ?? 0);
  const pct = max > 0 ? Math.round((total / max) * 1000) / 10 : 0;
  return {
    id: String(r.attempt_id),
    attempt_id: String(r.attempt_id),
    exam_id: String(r.exam_id),
    exam_title: examTitle,
    student_id: String(r.student_id),
    student_name: studentInfo?.full_name,
    student_phone: studentInfo?.phone,
    mcq_score: mcq,
    essay_score: essay,
    total_score: total,
    max_score: max,
    percentage: pct,
    ai_graded: Boolean(r.graded_by_ai),
    approved_at: String(r.computed_at ?? ''),
  };
}

function mapAuditRow(r: Record<string, unknown>, actorNameMap: Map<string, string>): AuditLogEntry {
  const actorId = r.actor_id != null ? String(r.actor_id) : '';
  return {
    id: String(r.id),
    actor_id: actorId,
    actor_name: actorNameMap.get(actorId) ?? (actorId || '—'),
    action: String(r.action ?? ''),
    entity_type: String(r.entity ?? ''),
    entity_id: r.entity_id != null ? String(r.entity_id) : '',
    details: (r.details as Record<string, unknown>) ?? {},
    created_at: String(r.at ?? ''),
  };
}

function mapYearEndReport(r: Record<string, unknown>): YearEndReport {
  return {
    id: String(r.id),
    academic_year: String(r.academic_year ?? ''),
    pdf_path: String(r.pdf_path ?? ''),
    registered_by: r.student_id != null ? String(r.student_id) : '',
    registered_at: String(r.generated_at ?? ''),
    purged_at: (r.details_deleted_at as string | null) ?? null,
  };
}

function mapSubscription(
  r: Record<string, unknown>,
  maps?: {
    profileMap?: Map<string, { full_name: string; phone: string }>;
    trackMap?: Map<string, Track>;
    stageMap?: Map<string, Stage>;
    termMap?: Map<string, Term>;
  }
): Subscription {
  const stuId = String(r.student_id);
  const trackId = String(r.track_id);
  const termId = String(r.term_id);
  const profile = maps?.profileMap?.get(stuId);
  const track = maps?.trackMap?.get(trackId);
  const stage = track ? maps?.stageMap?.get(track.stage_id) : undefined;
  const term = maps?.termMap?.get(termId);

  return {
    id: String(r.id),
    student_id: stuId,
    student_name: profile?.full_name,
    student_phone: profile?.phone,
    track_id: trackId,
    track_name: track?.name_ar,
    stage_id: track?.stage_id,
    stage_name: stage?.name_ar,
    term_id: termId,
    term_name: term?.name_ar,
    price_paid_egp: Number(r.price_paid_egp ?? 0),
    starts_at: String(r.starts_at ?? ''),
    ends_at: String(r.ends_at ?? ''),
    status: r.status as SubscriptionStatus,
    payment_request_id: r.payment_request_id != null ? String(r.payment_request_id) : null,
    granted_by: r.created_by != null ? String(r.created_by) : null,
    grant_note: (r.note as string | null) ?? null,
    created_at: String(r.created_at ?? ''),
  };
}

export class SupabaseAdminApi implements AdminApi {
  private sb: ReturnType<typeof getSupabaseClient>;

  constructor(client?: ReturnType<typeof getSupabaseClient>) {
    this.sb = client ?? getSupabaseClient();
  }

  private async fetchStaffNameMap(userIds: string[]): Promise<Map<string, string>> {
    const cleanIds = Array.from(new Set(userIds.filter(Boolean)));
    const map = new Map<string, string>();
    if (cleanIds.length === 0) return map;
    const { data, error } = await this.sb
      .from('staff_profiles')
      .select('user_id, full_name')
      .in('user_id', cleanIds);
    if (error) throw normalizeError(error);
    for (const s of (data ?? []) as Array<{ user_id: string; full_name: string }>) {
      map.set(s.user_id, s.full_name);
    }
    return map;
  }

  private async fetchSubscriptionById(subId: string): Promise<Subscription> {
    const { data, error } = await this.sb
      .from('subscriptions')
      .select(SUBSCRIPTION_COLS)
      .eq('id', subId)
      .single();
    const row = unwrap(data as Record<string, unknown> | null, error);
    return mapSubscription(row);
  }

  private async hydratePaymentRequests(
    requests: Array<Record<string, unknown>>
  ): Promise<PaymentQueueRow[]> {
    if (requests.length === 0) return [];

    const studentIds = Array.from(new Set(requests.map((r) => String(r.student_id)).filter(Boolean)));
    const reviewerIds = Array.from(
      new Set(requests.map((r) => (r.reviewed_by != null ? String(r.reviewed_by) : '')).filter(Boolean))
    );

    const [profilesRes, tracksRes, termsRes, govsRes, subsRes, prevReqRes, staffMap] = await Promise.all([
      studentIds.length > 0
        ? this.sb
            .from('profiles')
            .select('id, full_name, phone, governorate_id, trial_ends_at')
            .in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      this.sb.from('tracks').select('id, name_ar'),
      this.sb.from('terms').select('id, name_ar, access_ends_at'),
      this.sb.from('governorates').select('id, name_ar'),
      studentIds.length > 0
        ? this.sb
            .from('subscriptions')
            .select('id, student_id, status, ends_at')
            .in('student_id', studentIds)
            .eq('status', 'active')
        : Promise.resolve({ data: [], error: null }),
      studentIds.length > 0
        ? this.sb.from('payment_requests').select('id, student_id').in('student_id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      this.fetchStaffNameMap(reviewerIds),
    ]);

    if (profilesRes.error) throw normalizeError(profilesRes.error);
    if (tracksRes.error) throw normalizeError(tracksRes.error);
    if (termsRes.error) throw normalizeError(termsRes.error);
    if (govsRes.error) throw normalizeError(govsRes.error);
    if (subsRes.error) throw normalizeError(subsRes.error);
    if (prevReqRes.error) throw normalizeError(prevReqRes.error);

    const profileMap = new Map<string, Record<string, unknown>>();
    for (const p of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
      profileMap.set(String(p.id), p);
    }
    const trackMap = new Map<string, string>();
    for (const t of (tracksRes.data ?? []) as Array<Record<string, unknown>>) {
      trackMap.set(String(t.id), String(t.name_ar ?? ''));
    }
    const termMap = new Map<string, { name_ar: string; access_ends_at: string | null }>();
    for (const t of (termsRes.data ?? []) as Array<Record<string, unknown>>) {
      termMap.set(String(t.id), {
        name_ar: String(t.name_ar ?? ''),
        access_ends_at: (t.access_ends_at as string | null) ?? null,
      });
    }
    const govMap = new Map<string, string>();
    for (const g of (govsRes.data ?? []) as Array<Record<string, unknown>>) {
      govMap.set(String(g.id), String(g.name_ar ?? ''));
    }

    const nowMs = Date.now();
    const activeSubsCount = new Map<string, number>();
    for (const s of (subsRes.data ?? []) as Array<Record<string, unknown>>) {
      if (new Date(String(s.ends_at)).getTime() > nowMs) {
        const sid = String(s.student_id);
        activeSubsCount.set(sid, (activeSubsCount.get(sid) ?? 0) + 1);
      }
    }

    const totalReqsCount = new Map<string, number>();
    for (const pr of (prevReqRes.data ?? []) as Array<Record<string, unknown>>) {
      const sid = String(pr.student_id);
      totalReqsCount.set(sid, (totalReqsCount.get(sid) ?? 0) + 1);
    }

    return requests.map((r) => {
      const id = String(r.id);
      const stuId = String(r.student_id);
      const trackId = String(r.track_id);
      const termId = String(r.term_id);
      const reviewedBy = r.reviewed_by != null ? String(r.reviewed_by) : null;
      const profile = profileMap.get(stuId);
      const govId = profile?.governorate_id != null ? String(profile.governorate_id) : '';
      const term = termMap.get(termId);

      return {
        id,
        student_id: stuId,
        student_name: String(profile?.full_name ?? '—'),
        student_phone: String(profile?.phone ?? '—'),
        governorate_name: govMap.get(govId) ?? '—',
        track_id: trackId,
        track_name: trackMap.get(trackId) ?? '—',
        term_id: termId,
        term_name: term?.name_ar ?? '—',
        term_access_ends_at: term?.access_ends_at ?? null,
        amount_egp: Number(r.amount_egp ?? 0),
        sender_phone: String(r.sender_phone ?? ''),
        proof_path: (r.proof_path as string | null) ?? null,
        status: r.status as PaymentStatus,
        reviewed_by: reviewedBy,
        reviewer_name: reviewedBy ? (staffMap.get(reviewedBy) ?? null) : null,
        reviewed_at: (r.reviewed_at as string | null) ?? null,
        reject_reason: (r.reject_reason as string | null) ?? null,
        created_at: String(r.created_at ?? ''),
        student_trial_ends_at: String(profile?.trial_ends_at ?? r.created_at ?? ''),
        student_active_subscriptions_count: activeSubsCount.get(stuId) ?? 0,
        student_previous_requests_count: Math.max(0, (totalReqsCount.get(stuId) ?? 1) - 1),
      };
    });
  }

  private async hydrateStudentOverviewRows(
    viewRows: Array<Record<string, unknown>>
  ): Promise<StudentOverviewRow[]> {
    if (viewRows.length === 0) return [];
    const ids = viewRows.map((r) => String(r.id));
    const [profilesRes, tracks, stages] = await Promise.all([
      this.sb
        .from('profiles')
        .select('id, governorate_id, administration_id, track_id, blocked_reason')
        .in('id', ids),
      this.getTracks(),
      this.getStages(),
    ]);
    if (profilesRes.error) throw normalizeError(profilesRes.error);

    const profileMap = new Map<string, Record<string, unknown>>();
    for (const p of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
      profileMap.set(String(p.id), p);
    }
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    const stageMap = new Map(stages.map((s) => [s.id, s]));

    return viewRows.map((r) => {
      const id = String(r.id);
      const p = profileMap.get(id);
      const trackId = p?.track_id != null ? String(p.track_id) : '';
      const track = trackMap.get(trackId);
      const stage = track ? stageMap.get(track.stage_id) : undefined;
      const trialEndsAt = String(r.trial_ends_at ?? '');
      return {
        id,
        full_name: String(r.full_name ?? ''),
        phone: String(r.phone ?? ''),
        guardian_phone: (r.guardian_phone as string | null) ?? null,
        governorate_id: p?.governorate_id != null ? String(p.governorate_id) : '',
        governorate_name: String(r.governorate ?? '—'),
        administration_id: p?.administration_id != null ? String(p.administration_id) : null,
        administration_name: (r.administration as string | null) ?? null,
        stage_id: stage?.id ?? '',
        stage_name: stage?.name_ar ?? '—',
        track_id: trackId,
        track_name: String(r.track ?? track?.name_ar ?? '—'),
        trial_ends_at: trialEndsAt,
        trial_days_left: trialEndsAt ? Math.max(0, diffDaysFromNow(trialEndsAt)) : 0,
        active_subscriptions_count: Number(r.active_subscriptions ?? 0),
        is_blocked: Boolean(r.is_blocked),
        block_reason: (p?.blocked_reason as string | null) ?? null,
        created_at: String(r.created_at ?? ''),
      };
    });
  }

  async getCurrentSession(): Promise<AuthSessionState | null> {
    const { data, error } = await this.sb.auth.getSession();
    if (error) throw normalizeError(error);
    const user = data.session?.user;
    if (!user) return null;

    const [profileRes, rolesRes, aalRes, factorsRes] = await Promise.all([
      this.sb
        .from('staff_profiles')
        .select('user_id, full_name, created_at, updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      this.sb.from('staff_roles').select('role').eq('user_id', user.id),
      this.sb.auth.mfa.getAuthenticatorAssuranceLevel(),
      this.sb.auth.mfa.listFactors(),
    ]);
    if (profileRes.error) throw normalizeError(profileRes.error);
    if (rolesRes.error) throw normalizeError(rolesRes.error);
    if (aalRes.error) throw normalizeError(aalRes.error);
    if (factorsRes.error) throw normalizeError(factorsRes.error);

    const roles = ((rolesRes.data ?? []) as Array<{ role: StaffRole }>).map((r) => r.role);
    const profileRow = profileRes.data as {
      user_id: string;
      full_name: string;
      created_at: string;
      updated_at: string;
    } | null;

    const verifiedTotp = (factorsRes.data?.totp ?? []).filter(
      (f) => f.status === 'verified' && f.factor_type === 'totp'
    );
    const mfaEnrolled = verifiedTotp.length > 0;
    const verifiedTotpFactorId = verifiedTotp[0]?.id ?? null;
    const aalCurrentLevel = (aalRes.data?.currentLevel ?? null) as 'aal1' | 'aal2' | null;
    const aalNextLevel = (aalRes.data?.nextLevel ?? null) as 'aal1' | 'aal2' | null;

    const mfaReq = requiresMfa(roles);
    const mfaVerified = !mfaReq || aalCurrentLevel === 'aal2';

    return {
      userId: user.id,
      email: user.email ?? '',
      profile: profileRow
        ? {
            id: profileRow.user_id,
            email: user.email ?? '',
            full_name: profileRow.full_name,
            is_active: true,
            created_at: profileRow.created_at,
            roles,
          }
        : null,
      roles,
      mfaRequired: mfaReq,
      mfaVerified,
      mfaEnrolled,
      verifiedTotpFactorId,
      aalCurrentLevel,
      aalNextLevel,
    };
  }

  async signIn(email: string, password: string): Promise<AuthSessionState> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw normalizeError(error);
    const sess = await this.getCurrentSession();
    if (!sess) throw new AppError('UNAUTHENTICATED');
    return sess;
  }

  async enrollMfa(): Promise<MfaEnrollmentData> {
    const { data: factors, error: fErr } = await this.sb.auth.mfa.listFactors();
    if (fErr) throw normalizeError(fErr);

    const unverifiedLeftovers = (factors?.all ?? []).filter(
      (f) => f.factor_type === 'totp' && f.status !== 'verified'
    );
    for (const factor of unverifiedLeftovers) {
      const { error: uErr } = await this.sb.auth.mfa.unenroll({ factorId: factor.id });
      if (uErr) throw normalizeError(uErr);
    }

    const { data, error: eErr } = await this.sb.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Admin',
    });
    if (eErr) throw normalizeError(eErr);
    if (!data || data.type !== 'totp') {
      throw new AppError('UNKNOWN', 'تعذر إنشاء عامل التحقق الثنائي TOTP.');
    }

    const qrCode = normalizeQrDataUri(data.totp.qr_code ?? '');

    return {
      factorId: data.id,
      qrCode,
      secret: data.totp.secret,
      uri: data.totp.uri,
    };
  }

  async verifyMfa(code: string, factorId?: string): Promise<AuthSessionState> {
    let targetFactorId = factorId;
    if (!targetFactorId) {
      const { data: factors, error: fErr } = await this.sb.auth.mfa.listFactors();
      if (fErr) throw normalizeError(fErr);
      targetFactorId =
        factors?.totp?.[0]?.id ??
        factors?.all?.find((f) => f.factor_type === 'totp')?.id;
    }

    if (!targetFactorId) {
      throw new AppError('NOT_ALLOWED', 'لم يتم ربط تطبيق المصادقة الثنائية TOTP لهذا الحساب.');
    }

    const { error: vErr } = await this.sb.auth.mfa.challengeAndVerify({
      factorId: targetFactorId,
      code: code.trim(),
    });
    if (vErr) throw normalizeError(vErr);

    if (typeof this.sb.auth.refreshSession === 'function') {
      const { error: rErr } = await this.sb.auth.refreshSession();
      if (rErr) throw normalizeError(rErr);
    }

    const sess = await this.getCurrentSession();
    if (!sess) throw new AppError('UNAUTHENTICATED');
    return sess;
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    const nowIso = new Date().toISOString();
    const in7Iso = new Date(Date.now() + 7 * 86400_000).toISOString();
    const in24Iso = new Date(Date.now() + 86400_000).toISOString();

    const [
      pendingRes,
      oldestPendingRes,
      trialRes,
      trial7Res,
      blockedRes,
      termsRes,
      sessionsRes,
      inProgressRes,
      pubExamsRes,
      approvedResultsRes,
      pubLessonsRes,
      draftLessonsRes,
      auditRes,
    ] = await Promise.all([
      this.sb.from('payment_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      this.sb
        .from('payment_requests')
        .select('created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      this.sb
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_blocked', false)
        .gt('trial_ends_at', nowIso),
      this.sb
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_blocked', false)
        .gt('trial_ends_at', nowIso)
        .lte('trial_ends_at', in7Iso),
      this.sb.from('profiles').select('id', { count: 'exact', head: true }).eq('is_blocked', true),
      this.sb.from('terms').select(TERM_COLS).order('sort_order'),
      this.sb
        .from('exam_sessions')
        .select('id', { count: 'exact', head: true })
        .gte('ends_at', nowIso)
        .lte('starts_at', in24Iso),
      this.sb.from('exam_attempts').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
      this.sb.from('exams').select('id').eq('status', 'published'),
      this.sb.from('exam_results').select('exam_id'),
      this.sb.from('lessons').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      this.sb.from('lessons').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      this.sb.from('audit_log').select(AUDIT_LOG_COLS).order('at', { ascending: false }).limit(10),
    ]);

    for (const res of [
      pendingRes,
      oldestPendingRes,
      trialRes,
      trial7Res,
      blockedRes,
      termsRes,
      sessionsRes,
      inProgressRes,
      pubExamsRes,
      approvedResultsRes,
      pubLessonsRes,
      draftLessonsRes,
      auditRes,
    ]) {
      if (res.error) throw normalizeError(res.error);
    }

    const terms = ((termsRes.data ?? []) as Array<Record<string, unknown>>).map(mapTerm);
    const activeSubsByTerm = await Promise.all(
      terms.map(async (t) => {
        const { count, error: sErr } = await this.sb
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('term_id', Number(t.id))
          .eq('status', 'active')
          .gt('ends_at', nowIso);
        if (sErr) throw normalizeError(sErr);
        return { term_id: t.id, term_name: t.name_ar, count: count ?? 0 };
      })
    );

    const oldestDate = oldestPendingRes.data?.created_at as string | undefined;
    const oldestPendingDays = oldestDate
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestDate).getTime()) / 86400_000))
      : null;

    const approvedExamIds = new Set(
      ((approvedResultsRes.data ?? []) as Array<{ exam_id: string }>).map((r) => String(r.exam_id))
    );
    const examsAwaitingGradingCount = ((pubExamsRes.data ?? []) as Array<{ id: string }>).filter(
      (e) => !approvedExamIds.has(String(e.id))
    ).length;

    const rawAudit = (auditRes.data ?? []) as Array<Record<string, unknown>>;
    const actorIds = rawAudit.map((r) => (r.actor_id != null ? String(r.actor_id) : '')).filter(Boolean);
    const actorNameMap = await this.fetchStaffNameMap(actorIds);
    const recentAudit: AuditLogEntry[] = rawAudit.map((r) => mapAuditRow(r, actorNameMap));

    return {
      pendingPaymentsCount: pendingRes.count ?? 0,
      oldestPendingDays,
      studentsInTrialCount: trialRes.count ?? 0,
      trialsEnding7DaysCount: trial7Res.count ?? 0,
      activeSubscriptionsByTerm: activeSubsByTerm,
      blockedStudentsCount: blockedRes.count ?? 0,
      upcomingSessions24hCount: sessionsRes.count ?? 0,
      attemptsInProgressCount: inProgressRes.count ?? 0,
      examsAwaitingGradingCount,
      lessonsPublishedCount: pubLessonsRes.count ?? 0,
      lessonsDraftCount: draftLessonsRes.count ?? 0,
      termsMissingAccessEnd: terms.filter(
        (t) => !t.access_ends_at || new Date(t.access_ends_at).getTime() <= Date.now()
      ),
      recentAudit,
    };
  }

  async getGovernorates(): Promise<Governorate[]> {
    const { data, error } = await this.sb.from('governorates').select(GOV_COLS).order('sort_order');
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapGovernorate);
  }

  async createGovernorate(input: { name_ar: string; sort_order: number }): Promise<Governorate> {
    const { data, error } = await this.sb
      .from('governorates')
      .insert({ name_ar: input.name_ar, sort_order: input.sort_order })
      .select(GOV_COLS)
      .single();
    return mapGovernorate(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateGovernorate(id: string, input: { name_ar: string; sort_order: number }): Promise<Governorate> {
    const { data, error } = await this.sb
      .from('governorates')
      .update({ name_ar: input.name_ar, sort_order: input.sort_order })
      .eq('id', Number(id))
      .select(GOV_COLS)
      .single();
    return mapGovernorate(unwrap(data as Record<string, unknown> | null, error));
  }

  async deleteGovernorate(id: string): Promise<void> {
    const { error } = await this.sb.from('governorates').delete().eq('id', Number(id));
    if (error) throw normalizeError(error);
  }

  async getAdministrations(governorateId?: string): Promise<Administration[]> {
    let q = this.sb.from('administrations').select(ADMINISTER_COLS).order('name_ar');
    if (governorateId) q = q.eq('governorate_id', Number(governorateId));
    const { data, error } = await q;
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapAdministration);
  }

  async createAdministration(input: {
    governorate_id: string;
    name_ar: string;
    is_active: boolean;
  }): Promise<Administration> {
    const { data, error } = await this.sb
      .from('administrations')
      .insert({
        governorate_id: Number(input.governorate_id),
        name_ar: input.name_ar,
        is_active: input.is_active,
      })
      .select(ADMINISTER_COLS)
      .single();
    return mapAdministration(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateAdministration(id: string, input: { name_ar: string; is_active: boolean }): Promise<Administration> {
    const { data, error } = await this.sb
      .from('administrations')
      .update({ name_ar: input.name_ar, is_active: input.is_active })
      .eq('id', Number(id))
      .select(ADMINISTER_COLS)
      .single();
    return mapAdministration(unwrap(data as Record<string, unknown> | null, error));
  }

  async deleteAdministration(id: string): Promise<void> {
    const { error } = await this.sb.from('administrations').delete().eq('id', Number(id));
    if (error) throw normalizeError(error);
  }

  async bulkImportAdministrations(
    rows: Array<{ governorate: string; administration: string }>
  ): Promise<{ inserted: number; skippedDuplicates: number; unknownGovernorates: string[] }> {
    const [govs, existing] = await Promise.all([this.getGovernorates(), this.getAdministrations()]);
    const toInsert: Array<{ governorate_id: number; name_ar: string; is_active: boolean }> = [];
    const unknown = new Set<string>();
    let skippedDuplicates = 0;

    for (const r of rows) {
      const gov = govs.find((g) => g.name_ar === r.governorate.trim());
      if (!gov) {
        unknown.add(r.governorate);
        continue;
      }
      const dup = existing.some(
        (a) => a.governorate_id === gov.id && a.name_ar === r.administration.trim()
      );
      if (dup) {
        skippedDuplicates++;
        continue;
      }
      toInsert.push({
        governorate_id: Number(gov.id),
        name_ar: r.administration.trim(),
        is_active: true,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await this.sb.from('administrations').insert(toInsert);
      if (error) throw normalizeError(error);
    }
    return { inserted: toInsert.length, skippedDuplicates, unknownGovernorates: Array.from(unknown) };
  }

  async getStages(): Promise<Stage[]> {
    const { data, error } = await this.sb.from('stages').select(STAGE_COLS).order('sort_order');
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapStage);
  }

  async createStage(input: { name_ar: string; sort_order: number }): Promise<Stage> {
    const { data, error } = await this.sb
      .from('stages')
      .insert({ name_ar: input.name_ar, sort_order: input.sort_order })
      .select(STAGE_COLS)
      .single();
    return mapStage(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateStage(id: string, input: { name_ar: string; sort_order: number }): Promise<Stage> {
    const { data, error } = await this.sb
      .from('stages')
      .update({ name_ar: input.name_ar, sort_order: input.sort_order })
      .eq('id', Number(id))
      .select(STAGE_COLS)
      .single();
    return mapStage(unwrap(data as Record<string, unknown> | null, error));
  }

  async reorderStages(items: Array<{ id: string; name_ar: string; sort_order: number }>): Promise<void> {
    const { error } = await this.sb.from('stages').upsert(
      items.map((item) => ({
        id: Number(item.id),
        name_ar: item.name_ar,
        sort_order: item.sort_order,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new AppError('REORDER_FAILED');
  }

  async checkStageDependencies(id: string): Promise<DependencyCheckResult> {
    const { count, error } = await this.sb
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('stage_id', Number(id));
    if (error) throw normalizeError(error);
    const c = count ?? 0;
    return {
      canDelete: c === 0,
      dependencies: c > 0 ? [{ label: 'مسار/شعبة', count: c }] : [],
    };
  }

  async deleteStage(id: string): Promise<void> {
    const { error } = await this.sb.from('stages').delete().eq('id', Number(id));
    if (error) throw normalizeError(error);
  }

  async getTracks(stageId?: string): Promise<Track[]> {
    let q = this.sb.from('tracks').select(TRACK_COLS).order('sort_order');
    if (stageId) q = q.eq('stage_id', Number(stageId));
    const { data, error } = await q;
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapTrack);
  }

  async createTrack(input: {
    stage_id: string;
    name_ar: string;
    is_active: boolean;
    sort_order: number;
  }): Promise<Track> {
    const { data, error } = await this.sb
      .from('tracks')
      .insert({
        stage_id: Number(input.stage_id),
        name_ar: input.name_ar,
        is_active: input.is_active,
        sort_order: input.sort_order,
      })
      .select(TRACK_COLS)
      .single();
    return mapTrack(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateTrack(
    id: string,
    input: { stage_id: string; name_ar: string; is_active: boolean; sort_order: number }
  ): Promise<Track> {
    const { data, error } = await this.sb
      .from('tracks')
      .update({
        stage_id: Number(input.stage_id),
        name_ar: input.name_ar,
        is_active: input.is_active,
        sort_order: input.sort_order,
      })
      .eq('id', Number(id))
      .select(TRACK_COLS)
      .single();
    return mapTrack(unwrap(data as Record<string, unknown> | null, error));
  }

  async checkTrackDependencies(id: string): Promise<DependencyCheckResult> {
    const numericId = Number(id);
    const [stu, pl, sub, pay] = await Promise.all([
      this.sb.from('profiles').select('id', { count: 'exact', head: true }).eq('track_id', numericId),
      this.sb.from('plans').select('id', { count: 'exact', head: true }).eq('track_id', numericId),
      this.sb.from('subscriptions').select('id', { count: 'exact', head: true }).eq('track_id', numericId),
      this.sb.from('payment_requests').select('id', { count: 'exact', head: true }).eq('track_id', numericId),
    ]);
    for (const r of [stu, pl, sub, pay]) {
      if (r.error) throw normalizeError(r.error);
    }
    const deps = [];
    if ((stu.count ?? 0) > 0) deps.push({ label: 'طالب', count: stu.count ?? 0 });
    if ((pl.count ?? 0) > 0) deps.push({ label: 'خطة تسعير', count: pl.count ?? 0 });
    if ((sub.count ?? 0) > 0) deps.push({ label: 'اشتراك', count: sub.count ?? 0 });
    if ((pay.count ?? 0) > 0) deps.push({ label: 'طلب دفع', count: pay.count ?? 0 });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteTrack(id: string): Promise<void> {
    const { error } = await this.sb.from('tracks').delete().eq('id', Number(id));
    if (error) throw normalizeError(error);
  }

  async getCourses(): Promise<Course[]> {
    const { data, error } = await this.sb.from('courses').select(COURSE_COLS).order('sort_order');
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapCourse);
  }

  async createCourse(input: {
    name_ar: string;
    icon_key: CourseIconKey;
    sort_order: number;
    is_active: boolean;
  }): Promise<Course> {
    const { data, error } = await this.sb
      .from('courses')
      .insert({
        name_ar: input.name_ar,
        icon_key: input.icon_key,
        sort_order: input.sort_order,
        is_active: input.is_active,
      })
      .select(COURSE_COLS)
      .single();
    return mapCourse(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateCourse(
    id: string,
    input: { name_ar: string; icon_key: CourseIconKey; sort_order: number; is_active: boolean }
  ): Promise<Course> {
    const { data, error } = await this.sb
      .from('courses')
      .update({
        name_ar: input.name_ar,
        icon_key: input.icon_key,
        sort_order: input.sort_order,
        is_active: input.is_active,
      })
      .eq('id', Number(id))
      .select(COURSE_COLS)
      .single();
    return mapCourse(unwrap(data as Record<string, unknown> | null, error));
  }

  async checkCourseDependencies(id: string): Promise<DependencyCheckResult> {
    const numericId = Number(id);
    const [les, ex] = await Promise.all([
      this.sb.from('lessons').select('id', { count: 'exact', head: true }).eq('course_id', numericId),
      this.sb.from('exams').select('id', { count: 'exact', head: true }).eq('course_id', numericId),
    ]);
    if (les.error) throw normalizeError(les.error);
    if (ex.error) throw normalizeError(ex.error);
    const deps = [];
    if ((les.count ?? 0) > 0) deps.push({ label: 'درس', count: les.count ?? 0 });
    if ((ex.count ?? 0) > 0) deps.push({ label: 'امتحان', count: ex.count ?? 0 });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteCourse(id: string): Promise<void> {
    const { error } = await this.sb.from('courses').delete().eq('id', Number(id));
    if (error) throw normalizeError(error);
  }

  async getTrackCourses(): Promise<TrackCourse[]> {
    const { data, error } = await this.sb.from('track_courses').select(TRACK_COURSE_COLS).order('sort_order');
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapTrackCourse);
  }

  async linkTrackCourse(input: {
    track_id: string;
    course_id: string;
    sort_order: number;
  }): Promise<TrackCourse> {
    const { data, error } = await this.sb
      .from('track_courses')
      .insert({
        track_id: Number(input.track_id),
        course_id: Number(input.course_id),
        sort_order: input.sort_order,
      })
      .select(TRACK_COURSE_COLS)
      .single();
    return mapTrackCourse(unwrap(data as Record<string, unknown> | null, error));
  }

  async unlinkTrackCourse(trackId: string, courseId: string): Promise<void> {
    const { error } = await this.sb
      .from('track_courses')
      .delete()
      .eq('track_id', Number(trackId))
      .eq('course_id', Number(courseId));
    if (error) throw normalizeError(error);
  }

  async getTerms(): Promise<Term[]> {
    const { data, error } = await this.sb.from('terms').select(TERM_COLS).order('sort_order');
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapTerm);
  }

  async createTerm(input: {
    name_ar: string;
    sort_order: number;
    access_ends_at: string | null;
  }): Promise<Term> {
    const { data, error } = await this.sb
      .from('terms')
      .insert({
        name_ar: input.name_ar,
        sort_order: input.sort_order,
        access_ends_at: input.access_ends_at,
      })
      .select(TERM_COLS)
      .single();
    return mapTerm(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateTerm(
    id: string,
    input: { name_ar: string; sort_order: number; access_ends_at: string | null }
  ): Promise<Term> {
    const { data, error } = await this.sb
      .from('terms')
      .update({
        name_ar: input.name_ar,
        sort_order: input.sort_order,
        access_ends_at: input.access_ends_at,
      })
      .eq('id', Number(id))
      .select(TERM_COLS)
      .single();
    return mapTerm(unwrap(data as Record<string, unknown> | null, error));
  }

  async checkTermDependencies(id: string): Promise<DependencyCheckResult> {
    const numericId = Number(id);
    const [l, e, p, s] = await Promise.all([
      this.sb.from('lessons').select('id', { count: 'exact', head: true }).eq('term_id', numericId),
      this.sb.from('exams').select('id', { count: 'exact', head: true }).eq('term_id', numericId),
      this.sb.from('plans').select('id', { count: 'exact', head: true }).eq('term_id', numericId),
      this.sb.from('subscriptions').select('id', { count: 'exact', head: true }).eq('term_id', numericId),
    ]);
    for (const r of [l, e, p, s]) {
      if (r.error) throw normalizeError(r.error);
    }
    const deps = [];
    if ((l.count ?? 0) > 0) deps.push({ label: 'درس', count: l.count ?? 0 });
    if ((e.count ?? 0) > 0) deps.push({ label: 'امتحان', count: e.count ?? 0 });
    if ((p.count ?? 0) > 0) deps.push({ label: 'خطة تسعير', count: p.count ?? 0 });
    if ((s.count ?? 0) > 0) deps.push({ label: 'اشتراك', count: s.count ?? 0 });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteTerm(id: string): Promise<void> {
    const { error } = await this.sb.from('terms').delete().eq('id', Number(id));
    if (error) throw normalizeError(error);
  }

  async getAllowedLinkDomains(): Promise<AllowedLinkDomain[]> {
    const { data, error } = await this.sb
      .from('allowed_link_domains')
      .select(DOMAIN_COLS)
      .order('domain');
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<{ domain: string; kind: LinkKind }>).map((r) => ({
      id: r.domain,
      domain: r.domain,
      kind: r.kind,
      is_active: true,
    }));
  }

  async createAllowedLinkDomain(input: {
    domain: string;
    kind: LinkKind;
    is_active: boolean;
  }): Promise<AllowedLinkDomain> {
    const { data, error } = await this.sb
      .from('allowed_link_domains')
      .insert({
        domain: input.domain.trim().toLowerCase(),
        kind: input.kind,
      })
      .select(DOMAIN_COLS)
      .single();
    const row = unwrap(data as { domain: string; kind: LinkKind } | null, error);
    return { id: row.domain, domain: row.domain, kind: row.kind, is_active: true };
  }

  async updateAllowedLinkDomain(
    id: string,
    input: { domain: string; kind: LinkKind; is_active: boolean }
  ): Promise<AllowedLinkDomain> {
    const { data, error } = await this.sb
      .from('allowed_link_domains')
      .update({
        domain: input.domain.trim().toLowerCase(),
        kind: input.kind,
      })
      .eq('domain', id)
      .select(DOMAIN_COLS)
      .single();
    const row = unwrap(data as { domain: string; kind: LinkKind } | null, error);
    return { id: row.domain, domain: row.domain, kind: row.kind, is_active: true };
  }

  async deleteAllowedLinkDomain(id: string): Promise<void> {
    const { error } = await this.sb.from('allowed_link_domains').delete().eq('domain', id);
    if (error) throw normalizeError(error);
  }

  async getLessons(filter: LessonsFilter): Promise<PaginatedResult<LessonWithContext>> {
    const [from, to] = getRange(filter.page ?? 1, filter.pageSize ?? 50);
    const [tcs, tracks, stages, courses, terms] = await Promise.all([
      this.getTrackCourses(),
      this.getTracks(),
      this.getStages(),
      this.getCourses(),
      this.getTerms(),
    ]);

    let allowedCourseIds: string[] | null = null;
    if (filter.trackId) {
      allowedCourseIds = tcs.filter((tc) => tc.track_id === filter.trackId).map((tc) => tc.course_id);
    } else if (filter.stageId) {
      const stageTrackIds = new Set(tracks.filter((t) => t.stage_id === filter.stageId).map((t) => t.id));
      allowedCourseIds = tcs.filter((tc) => stageTrackIds.has(tc.track_id)).map((tc) => tc.course_id);
    }

    if (allowedCourseIds && allowedCourseIds.length === 0) {
      return { items: [], total: 0 };
    }

    let q = this.sb
      .from('lessons')
      .select(LESSON_COLS, { count: 'exact' })
      .order('sort_order');

    if (filter.courseId) q = q.eq('course_id', Number(filter.courseId));
    if (allowedCourseIds) {
      q = q.in(
        'course_id',
        Array.from(new Set(allowedCourseIds)).map((id) => Number(id))
      );
    }
    if (filter.termId) q = q.eq('term_id', Number(filter.termId));
    if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      q = q.or(`title.ilike.${term},summary.ilike.${term}`);
    }
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const lessonIds = rows.map((r) => String(r.id));
    const itemMap = new Map<string, Array<{ id: string; item_type: LessonItemType }>>();
    if (lessonIds.length > 0) {
      const { data: itemRows, error: iErr } = await this.sb
        .from('lesson_items')
        .select('id, lesson_id, item_type')
        .in('lesson_id', lessonIds);
      if (iErr) throw normalizeError(iErr);
      for (const it of (itemRows ?? []) as Array<Record<string, unknown>>) {
        const lid = String(it.lesson_id);
        const list = itemMap.get(lid) ?? [];
        list.push({ id: String(it.id), item_type: it.item_type as LessonItemType });
        itemMap.set(lid, list);
      }
    }

    const courseMap = new Map(courses.map((c) => [c.id, c.name_ar]));
    const termMap = new Map(terms.map((t) => [t.id, t.name_ar]));

    const items = rows.map((row) => {
      const les = mapLesson(row);
      const linkedTracks = tcs
        .filter((tc) => tc.course_id === les.course_id)
        .map((tc) => {
          const tr = tracks.find((t) => t.id === tc.track_id);
          const st = tr ? stages.find((s) => s.id === tr.stage_id) : undefined;
          return tr && st
            ? { track_id: tr.id, track_name: tr.name_ar, stage_id: st.id, stage_name: st.name_ar }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const rawItems = itemMap.get(les.id) ?? [];
      return {
        ...les,
        course_name: courseMap.get(les.course_id) ?? '—',
        term_name: termMap.get(les.term_id) ?? '—',
        tracks: linkedTracks,
        items_count: rawItems.length,
        item_types: Array.from(new Set(rawItems.map((i) => i.item_type))),
      };
    });

    return { items, total: count ?? items.length };
  }

  async getLessonDetail(lessonId: string): Promise<LessonDetailData> {
    const { data: lesson, error } = await this.sb
      .from('lessons')
      .select(LESSON_COLS)
      .eq('id', lessonId)
      .single();
    if (error) throw normalizeError(error);
    const les = mapLesson(lesson as Record<string, unknown>);

    const [courseRes, termRes, tcs, tracks, stages, itemsRes] = await Promise.all([
      this.sb.from('courses').select(COURSE_COLS).eq('id', Number(les.course_id)).single(),
      this.sb.from('terms').select(TERM_COLS).eq('id', Number(les.term_id)).single(),
      this.getTrackCourses(),
      this.getTracks(),
      this.getStages(),
      this.sb
        .from('lesson_items')
        .select(
          'id, lesson_id, item_type, title, sort_order, body_json, body_html, url, link_kind, android_only, created_at, updated_at, quick_questions(id, item_id, prompt, explanation, sort_order, created_at, quick_question_options(id, question_id, text, is_correct, sort_order))'
        )
        .eq('lesson_id', lessonId)
        .order('sort_order'),
    ]);
    if (courseRes.error) throw normalizeError(courseRes.error);
    if (termRes.error) throw normalizeError(termRes.error);
    if (itemsRes.error) throw normalizeError(itemsRes.error);

    const linkedTracks = tcs
      .filter((tc) => tc.course_id === les.course_id)
      .map((tc) => {
        const track = tracks.find((t) => t.id === tc.track_id);
        const stage = track ? stages.find((s) => s.id === track.stage_id) : undefined;
        return track && stage ? { track, stage } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      lesson: les,
      course: mapCourse(courseRes.data as Record<string, unknown>),
      term: mapTerm(termRes.data as Record<string, unknown>),
      tracks: linkedTracks,
      items: ((itemsRes.data ?? []) as Array<Record<string, unknown>>).map(mapLessonItem),
    };
  }

  async createLesson(input: {
    course_id: string;
    term_id: string;
    title: string;
    summary: string | null;
  }): Promise<Lesson> {
    const courseId = Number(input.course_id);
    const termId = Number(input.term_id);
    const { data: maxRow, error: mErr } = await this.sb
      .from('lessons')
      .select('sort_order')
      .eq('course_id', courseId)
      .eq('term_id', termId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mErr) throw normalizeError(mErr);
    const nextOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;
    const { data, error } = await this.sb
      .from('lessons')
      .insert({
        course_id: courseId,
        term_id: termId,
        title: input.title,
        summary: input.summary,
        sort_order: nextOrder,
        status: 'draft',
      })
      .select(LESSON_COLS)
      .single();
    return mapLesson(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateLessonMeta(
    lessonId: string,
    input: { title: string; summary: string | null }
  ): Promise<Lesson> {
    const { data, error } = await this.sb
      .from('lessons')
      .update({ title: input.title, summary: input.summary })
      .eq('id', lessonId)
      .select(LESSON_COLS)
      .single();
    return mapLesson(unwrap(data as Record<string, unknown> | null, error));
  }

  async setLessonStatus(lessonId: string, status: LessonStatus): Promise<Lesson> {
    const updatePayload =
      status === 'published'
        ? { status, published_at: new Date().toISOString() }
        : { status };
    const { data, error } = await this.sb
      .from('lessons')
      .update(updatePayload)
      .eq('id', lessonId)
      .select(LESSON_COLS)
      .single();
    return mapLesson(unwrap(data as Record<string, unknown> | null, error));
  }

  async reorderLessons(
    rows: Array<{ id: string; course_id: string; term_id: string; title: string; sort_order: number }>
  ): Promise<void> {
    const { error } = await this.sb.from('lessons').upsert(
      rows.map((r) => ({
        id: r.id,
        course_id: Number(r.course_id),
        term_id: Number(r.term_id),
        title: r.title,
        sort_order: r.sort_order,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new AppError('REORDER_FAILED');
  }

  async getLessonDeleteImpact(lessonId: string): Promise<{ progressCount: number; answersCount: number }> {
    const { data: items, error: iErr } = await this.sb
      .from('lesson_items')
      .select('id')
      .eq('lesson_id', lessonId);
    if (iErr) throw normalizeError(iErr);
    const ids = (items ?? []).map((i: { id: string }) => i.id);
    if (ids.length === 0) return { progressCount: 0, answersCount: 0 };
    const [progRes, qqRes] = await Promise.all([
      this.sb.from('item_progress').select('student_id', { count: 'exact', head: true }).in('item_id', ids),
      this.sb.from('quick_questions').select('id').in('item_id', ids),
    ]);
    if (progRes.error) throw normalizeError(progRes.error);
    if (qqRes.error) throw normalizeError(qqRes.error);
    const qIds = ((qqRes.data ?? []) as Array<{ id: string }>).map((q) => q.id);
    let answersCount = 0;
    if (qIds.length > 0) {
      const { count, error: aErr } = await this.sb
        .from('quick_answers')
        .select('student_id', { count: 'exact', head: true })
        .in('question_id', qIds);
      if (aErr) throw normalizeError(aErr);
      answersCount = count ?? 0;
    }
    return { progressCount: progRes.count ?? 0, answersCount };
  }

  async deleteLesson(lessonId: string): Promise<void> {
    const { error } = await this.sb.from('lessons').delete().eq('id', lessonId);
    if (error) throw normalizeError(error);
  }

  async createLessonItem(input: {
    lesson_id: string;
    item_type: LessonItemType;
    title: string;
    body_json?: Record<string, unknown> | null;
    body_html?: string | null;
    url?: string | null;
  }): Promise<LessonItem> {
    const { data: maxRow, error: mErr } = await this.sb
      .from('lesson_items')
      .select('sort_order')
      .eq('lesson_id', input.lesson_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mErr) throw normalizeError(mErr);
    const nextOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;

    const payload: {
      lesson_id: string;
      item_type: LessonItemType;
      title: string;
      sort_order: number;
      body_json?: Record<string, unknown> | null;
      body_html?: string | null;
      url?: string | null;
    } = {
      lesson_id: input.lesson_id,
      item_type: input.item_type,
      title: input.title,
      sort_order: nextOrder,
    };
    if (input.item_type === 'article') {
      payload.body_json = input.body_json ?? { type: 'doc', content: [] };
      payload.body_html = sanitizeArticleHtml(input.body_html ?? '<p></p>');
      payload.url = null;
    } else if (input.item_type === 'link') {
      payload.url = input.url ?? null;
    }
    const { data, error } = await this.sb
      .from('lesson_items')
      .insert(payload)
      .select(LESSON_ITEM_COLS)
      .single();
    return mapLessonItem(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateLessonItem(
    itemId: string,
    input: {
      title: string;
      body_json?: Record<string, unknown> | null;
      body_html?: string | null;
      url?: string | null;
    }
  ): Promise<LessonItem> {
    const payload: {
      title: string;
      body_json?: Record<string, unknown> | null;
      body_html?: string | null;
      url?: string | null;
    } = { title: input.title };
    if (input.body_json !== undefined) payload.body_json = input.body_json;
    if (input.body_html !== undefined) payload.body_html = sanitizeArticleHtml(input.body_html ?? '');
    if (input.url !== undefined) payload.url = input.url;

    const { data, error } = await this.sb
      .from('lesson_items')
      .update(payload)
      .eq('id', itemId)
      .select(LESSON_ITEM_COLS)
      .single();
    return mapLessonItem(unwrap(data as Record<string, unknown> | null, error));
  }

  async reorderLessonItems(
    rows: Array<{
      id: string;
      lesson_id: string;
      item_type: LessonItemType;
      title: string;
      sort_order: number;
    }>
  ): Promise<void> {
    const { error } = await this.sb.from('lesson_items').upsert(
      rows.map((r) => ({
        id: r.id,
        lesson_id: r.lesson_id,
        item_type: r.item_type,
        title: r.title,
        sort_order: r.sort_order,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new AppError('REORDER_FAILED');
  }

  async getLessonItemDeleteImpact(itemId: string): Promise<{ progressCount: number; answersCount: number }> {
    const [progRes, qqRes] = await Promise.all([
      this.sb
        .from('item_progress')
        .select('student_id', { count: 'exact', head: true })
        .eq('item_id', itemId),
      this.sb.from('quick_questions').select('id').eq('item_id', itemId),
    ]);
    if (progRes.error) throw normalizeError(progRes.error);
    if (qqRes.error) throw normalizeError(qqRes.error);
    const qIds = ((qqRes.data ?? []) as Array<{ id: string }>).map((q) => q.id);
    let answersCount = 0;
    if (qIds.length > 0) {
      const { count: aCount, error: aErr } = await this.sb
        .from('quick_answers')
        .select('student_id', { count: 'exact', head: true })
        .in('question_id', qIds);
      if (aErr) throw normalizeError(aErr);
      answersCount = aCount ?? 0;
    }
    return { progressCount: progRes.count ?? 0, answersCount };
  }

  async deleteLessonItem(itemId: string): Promise<void> {
    const { error } = await this.sb.from('lesson_items').delete().eq('id', itemId);
    if (error) throw normalizeError(error);
  }

  async upsertQuickQuestion(input: {
    id?: string;
    item_id: string;
    prompt: string;
    explanation: string | null;
    options: Array<{ id?: string; option_text: string; is_correct: boolean; sort_order: number }>;
  }): Promise<void> {
    let qId = input.id;
    if (!qId) {
      const { data: maxRow, error: mErr } = await this.sb
        .from('quick_questions')
        .select('sort_order')
        .eq('item_id', input.item_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mErr) throw normalizeError(mErr);
      const nextOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;
      const { data, error } = await this.sb
        .from('quick_questions')
        .insert({
          item_id: input.item_id,
          prompt: input.prompt,
          explanation: input.explanation,
          sort_order: nextOrder,
        })
        .select('id')
        .single();
      if (error) throw normalizeError(error);
      qId = String(data.id);
    } else {
      const { error } = await this.sb
        .from('quick_questions')
        .update({ prompt: input.prompt, explanation: input.explanation })
        .eq('id', qId);
      if (error) throw normalizeError(error);
      const { error: delErr } = await this.sb.from('quick_question_options').delete().eq('question_id', qId);
      if (delErr) throw normalizeError(delErr);
    }

    if (input.options.length > 0) {
      const { error: optErr } = await this.sb.from('quick_question_options').insert(
        input.options.map((o, idx) => ({
          question_id: qId,
          text: o.option_text,
          is_correct: o.is_correct,
          sort_order: idx + 1,
        }))
      );
      if (optErr) throw normalizeError(optErr);
    }
  }

  async deleteQuickQuestion(questionId: string): Promise<void> {
    const { error } = await this.sb.from('quick_questions').delete().eq('id', questionId);
    if (error) throw normalizeError(error);
  }

  async reorderQuickQuestions(
    rows: Array<{ id: string; item_id: string; prompt: string; sort_order: number }>
  ): Promise<void> {
    const { error } = await this.sb.from('quick_questions').upsert(
      rows.map((r) => ({
        id: r.id,
        item_id: r.item_id,
        prompt: r.prompt,
        sort_order: r.sort_order,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new AppError('REORDER_FAILED');
  }

  async uploadContentMedia(file: File): Promise<{ publicUrl: string; path: string }> {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) throw new AppError('FILE_TYPE_NOT_ALLOWED');
    if (file.size > 5 * 1024 * 1024) throw new AppError('FILE_TOO_LARGE');
    const path = `article/${crypto.randomUUID()}/${file.name}`;
    const { error } = await this.sb.storage.from('content-media').upload(path, file, { upsert: false });
    if (error) throw normalizeError(error);
    const { data } = this.sb.storage.from('content-media').getPublicUrl(path);
    return { publicUrl: data.publicUrl, path };
  }

  async deleteContentMedia(path: string): Promise<void> {
    await this.sb.storage.from('content-media').remove([path]);
  }

  async getPlans(): Promise<Plan[]> {
    const { data, error } = await this.sb
      .from('plans')
      .select(PLAN_COLS)
      .order('created_at', { ascending: false });
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapPlan);
  }

  async createPlan(input: {
    track_id: string;
    term_id: string;
    price_egp: number;
    is_active: boolean;
  }): Promise<Plan> {
    const { data, error } = await this.sb
      .from('plans')
      .insert({
        track_id: Number(input.track_id),
        term_id: Number(input.term_id),
        price_egp: input.price_egp,
        is_active: input.is_active,
      })
      .select(PLAN_COLS)
      .single();
    return mapPlan(unwrap(data as Record<string, unknown> | null, error));
  }

  async updatePlan(id: string, input: { price_egp: number; is_active: boolean }): Promise<Plan> {
    const { data, error } = await this.sb
      .from('plans')
      .update({ price_egp: input.price_egp, is_active: input.is_active })
      .eq('id', id)
      .select(PLAN_COLS)
      .single();
    return mapPlan(unwrap(data as Record<string, unknown> | null, error));
  }

  async deletePlan(id: string): Promise<void> {
    const { error } = await this.sb.from('plans').delete().eq('id', id);
    if (error) throw normalizeError(error);
  }

  async getSubscriptions(filter: SubscriptionsFilter): Promise<PaginatedResult<Subscription>> {
    const [from, to] = getRange(filter.page ?? 1, filter.pageSize ?? 25);

    let stageTrackIds: number[] | null = null;
    if (filter.stageId && !filter.trackId) {
      const tracks = await this.getTracks(filter.stageId);
      stageTrackIds = tracks.map((t) => Number(t.id));
      if (stageTrackIds.length === 0) return { items: [], total: 0 };
    }

    let matchingStudentIds: string[] | null = null;
    if (filter.search?.trim()) {
      const s = `%${filter.search.trim()}%`;
      const { data: matchedProfiles, error: mErr } = await this.sb
        .from('profiles')
        .select('id')
        .or(`full_name.ilike.${s},phone.ilike.${s}`)
        .limit(500);
      if (mErr) throw normalizeError(mErr);
      matchingStudentIds = ((matchedProfiles ?? []) as Array<{ id: string }>).map((p) => p.id);
      if (matchingStudentIds.length === 0) return { items: [], total: 0 };
    }

    let q = this.sb
      .from('subscriptions')
      .select(SUBSCRIPTION_COLS, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
    if (filter.termId) q = q.eq('term_id', Number(filter.termId));
    if (filter.trackId) q = q.eq('track_id', Number(filter.trackId));
    if (stageTrackIds) q = q.in('track_id', stageTrackIds);
    if (matchingStudentIds) q = q.in('student_id', matchingStudentIds);
    if (filter.fromDate) q = q.gte('starts_at', filter.fromDate);
    if (filter.toDate) q = q.lte('starts_at', filter.toDate);
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const studentIds = Array.from(new Set(rows.map((r) => String(r.student_id)).filter(Boolean)));
    const [profilesRes, tracks, stages, terms] = await Promise.all([
      studentIds.length > 0
        ? this.sb.from('profiles').select('id, full_name, phone').in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      this.getTracks(),
      this.getStages(),
      this.getTerms(),
    ]);
    if (profilesRes.error) throw normalizeError(profilesRes.error);

    const profileMap = new Map<string, { full_name: string; phone: string }>();
    for (const p of (profilesRes.data ?? []) as Array<{ id: string; full_name: string; phone: string }>) {
      profileMap.set(p.id, { full_name: p.full_name, phone: p.phone });
    }
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const termMap = new Map(terms.map((t) => [t.id, t]));

    const items = rows.map((r) =>
      mapSubscription(r, { profileMap, trackMap, stageMap, termMap })
    );
    return { items, total: count ?? items.length };
  }

  async grantSubscription(input: {
    student_id: string;
    term_id: string;
    ends_at: string;
    note?: string;
  }): Promise<Subscription> {
    const { data, error } = await this.sb.rpc('grant_subscription', {
      p_student: input.student_id,
      p_term: Number(input.term_id),
      p_ends_at: input.ends_at,
      p_note: input.note ?? null,
    });
    const subId = unwrap(data as string | null, error);
    return this.fetchSubscriptionById(String(subId));
  }

  async getPaymentQueue(filter: PaymentQueueFilter): Promise<PaginatedResult<PaymentQueueRow>> {
    const [from, to] = getRange(filter.page ?? 1, filter.pageSize ?? 25);

    let searchIds: string[] | null = null;
    if (filter.search?.trim()) {
      const s = `%${filter.search.trim()}%`;
      const { data: viewMatches, error: vErr } = await this.sb
        .from('v_payment_queue')
        .select('id')
        .eq('status', filter.status)
        .or(`student_name.ilike.${s},student_phone.ilike.${s},sender_phone.ilike.${s}`)
        .limit(500);
      if (vErr) throw normalizeError(vErr);
      searchIds = ((viewMatches ?? []) as Array<{ id: string }>).map((m) => String(m.id));
      if (searchIds.length === 0) return { items: [], total: 0 };
    }

    let q = this.sb
      .from('payment_requests')
      .select(PAYMENT_REQUEST_COLS, { count: 'exact' })
      .eq('status', filter.status)
      .order('created_at', { ascending: filter.status === 'pending' });
    if (filter.termId) q = q.eq('term_id', Number(filter.termId));
    if (filter.trackId) q = q.eq('track_id', Number(filter.trackId));
    if (filter.fromDate) q = q.gte('created_at', filter.fromDate);
    if (filter.toDate) q = q.lte('created_at', filter.toDate);
    if (searchIds) q = q.in('id', searchIds);

    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);

    const items = await this.hydratePaymentRequests((data ?? []) as Array<Record<string, unknown>>);
    return { items, total: count ?? items.length };
  }

  async getPaymentProofSignedUrl(proofPath: string): Promise<string> {
    const { data, error } = await this.sb.storage.from('payment-proofs').createSignedUrl(proofPath, 120);
    if (error) throw normalizeError(error);
    return data.signedUrl;
  }

  async approvePayment(requestId: string, endsAtOverride?: string | null): Promise<Subscription> {
    const { data, error } = await this.sb.rpc('approve_payment', {
      p_request_id: requestId,
      p_ends_at: endsAtOverride ?? null,
    });
    const subId = unwrap(data as string | null, error);
    return this.fetchSubscriptionById(String(subId));
  }

  async rejectPayment(requestId: string, reason: string): Promise<void> {
    const { error } = await this.sb.rpc('reject_payment', {
      p_request_id: requestId,
      p_reason: reason,
    });
    if (error) throw normalizeError(error);
  }

  async getStudents(filter: StudentsFilter): Promise<PaginatedResult<StudentOverviewRow>> {
    const [from, to] = getRange(filter.page ?? 1, filter.pageSize ?? 25);
    const nowIso = new Date().toISOString();

    let matchingIds: string[] | null = null;
    if (filter.governorateId || filter.administrationId || filter.trackId || filter.stageId) {
      let pq = this.sb.from('profiles').select('id');
      if (filter.governorateId) pq = pq.eq('governorate_id', Number(filter.governorateId));
      if (filter.administrationId) pq = pq.eq('administration_id', Number(filter.administrationId));
      if (filter.trackId) {
        pq = pq.eq('track_id', Number(filter.trackId));
      } else if (filter.stageId) {
        const tracks = await this.getTracks(filter.stageId);
        const stageTrackIds = tracks.map((t) => Number(t.id));
        if (stageTrackIds.length === 0) return { items: [], total: 0 };
        pq = pq.in('track_id', stageTrackIds);
      }
      const { data: matched, error: pErr } = await pq.limit(5000);
      if (pErr) throw normalizeError(pErr);
      matchingIds = ((matched ?? []) as Array<{ id: string }>).map((m) => String(m.id));
      if (matchingIds.length === 0) return { items: [], total: 0 };
    }

    let q = this.sb
      .from('v_students_overview')
      .select(STUDENT_VIEW_COLS, { count: 'exact' })
      .order(filter.sortBy ?? 'created_at', { ascending: filter.sortDir === 'asc' });

    if (matchingIds) q = q.in('id', matchingIds);
    if (filter.search?.trim()) {
      const s = `%${filter.search.trim()}%`;
      q = q.or(`full_name.ilike.${s},phone.ilike.${s}`);
    }
    if (filter.status && filter.status !== 'all') {
      if (filter.status === 'blocked') {
        q = q.eq('is_blocked', true);
      } else if (filter.status === 'subscribed') {
        q = q.eq('is_blocked', false).gt('active_subscriptions', 0);
      } else if (filter.status === 'trial') {
        q = q.eq('is_blocked', false).eq('active_subscriptions', 0).gt('trial_ends_at', nowIso);
      } else if (filter.status === 'expired') {
        q = q.eq('is_blocked', false).eq('active_subscriptions', 0).lte('trial_ends_at', nowIso);
      }
    }
    if (filter.fromDate) q = q.gte('created_at', filter.fromDate);
    if (filter.toDate) q = q.lte('created_at', filter.toDate);
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);

    const items = await this.hydrateStudentOverviewRows((data ?? []) as Array<Record<string, unknown>>);
    return { items, total: count ?? items.length };
  }

  async getStudentDetail(studentId: string): Promise<{
    student: StudentOverviewRow;
    subscriptions: Subscription[];
    payments: PaymentQueueRow[];
  }> {
    const [stuRes, subRes, payRes, tracks, stages, terms, profRes] = await Promise.all([
      this.sb.from('v_students_overview').select(STUDENT_VIEW_COLS).eq('id', studentId).single(),
      this.sb
        .from('subscriptions')
        .select(SUBSCRIPTION_COLS)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      this.sb
        .from('payment_requests')
        .select(PAYMENT_REQUEST_COLS)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      this.getTracks(),
      this.getStages(),
      this.getTerms(),
      this.sb
        .from('profiles')
        .select('id, full_name, phone, governorate_id, administration_id, track_id, blocked_reason')
        .eq('id', studentId)
        .maybeSingle(),
    ]);
    if (stuRes.error) throw normalizeError(stuRes.error);
    if (subRes.error) throw normalizeError(subRes.error);
    if (payRes.error) throw normalizeError(payRes.error);
    if (profRes.error) throw normalizeError(profRes.error);

    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    const stageMap = new Map(stages.map((s) => [s.id, s]));
    const termMap = new Map(terms.map((t) => [t.id, t]));
    const pRow = profRes.data as Record<string, unknown> | null;
    const profileMap = new Map<string, { full_name: string; phone: string }>();
    if (pRow) {
      profileMap.set(studentId, {
        full_name: String(pRow.full_name ?? ''),
        phone: String(pRow.phone ?? ''),
      });
    }

    const vRow = stuRes.data as Record<string, unknown>;
    const trackId = pRow?.track_id != null ? String(pRow.track_id) : '';
    const tr = trackMap.get(trackId);
    const st = tr ? stageMap.get(tr.stage_id) : undefined;
    const trialEndsAt = String(vRow.trial_ends_at ?? '');

    const student: StudentOverviewRow = {
      id: String(vRow.id),
      full_name: String(vRow.full_name ?? ''),
      phone: String(vRow.phone ?? ''),
      guardian_phone: (vRow.guardian_phone as string | null) ?? null,
      governorate_id: pRow?.governorate_id != null ? String(pRow.governorate_id) : '',
      governorate_name: String(vRow.governorate ?? '—'),
      administration_id: pRow?.administration_id != null ? String(pRow.administration_id) : null,
      administration_name: (vRow.administration as string | null) ?? null,
      stage_id: st?.id ?? '',
      stage_name: st?.name_ar ?? '—',
      track_id: trackId,
      track_name: String(vRow.track ?? tr?.name_ar ?? '—'),
      trial_ends_at: trialEndsAt,
      trial_days_left: trialEndsAt ? Math.max(0, diffDaysFromNow(trialEndsAt)) : 0,
      active_subscriptions_count: Number(vRow.active_subscriptions ?? 0),
      is_blocked: Boolean(vRow.is_blocked),
      block_reason: (pRow?.blocked_reason as string | null) ?? null,
      created_at: String(vRow.created_at ?? ''),
    };

    const subscriptions = ((subRes.data ?? []) as Array<Record<string, unknown>>).map((r) =>
      mapSubscription(r, { profileMap, trackMap, stageMap, termMap })
    );
    const payments = await this.hydratePaymentRequests(
      (payRes.data ?? []) as Array<Record<string, unknown>>
    );

    return { student, subscriptions, payments };
  }

  async getStudentActivity(studentId: string): Promise<{
    progress: StudentItemProgress[];
    quickAnswers: StudentQuickAnswer[];
  }> {
    const [progRes, ansRes] = await Promise.all([
      this.sb
        .from('item_progress')
        .select('student_id, item_id, status, completed_at, updated_at')
        .eq('student_id', studentId),
      this.sb
        .from('quick_answers')
        .select('student_id, question_id, option_id, is_correct, attempts, answered_at')
        .eq('student_id', studentId),
    ]);
    if (progRes.error) throw normalizeError(progRes.error);
    if (ansRes.error) throw normalizeError(ansRes.error);

    const progRows = (progRes.data ?? []) as Array<Record<string, unknown>>;
    const ansRows = (ansRes.data ?? []) as Array<Record<string, unknown>>;

    const itemIds = Array.from(new Set(progRows.map((r) => String(r.item_id)).filter(Boolean)));
    const qIds = Array.from(new Set(ansRows.map((r) => String(r.question_id)).filter(Boolean)));
    const optIds = Array.from(new Set(ansRows.map((r) => String(r.option_id)).filter(Boolean)));

    const [itemsRes, qqRes, optsRes] = await Promise.all([
      itemIds.length > 0
        ? this.sb.from('lesson_items').select('id, title, lesson_id').in('id', itemIds)
        : Promise.resolve({ data: [], error: null }),
      qIds.length > 0
        ? this.sb.from('quick_questions').select('id, prompt').in('id', qIds)
        : Promise.resolve({ data: [], error: null }),
      optIds.length > 0
        ? this.sb.from('quick_question_options').select('id, text').in('id', optIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (itemsRes.error) throw normalizeError(itemsRes.error);
    if (qqRes.error) throw normalizeError(qqRes.error);
    if (optsRes.error) throw normalizeError(optsRes.error);

    const itemMap = new Map<string, { title: string; lesson_id: string }>();
    const lessonIds: string[] = [];
    for (const it of (itemsRes.data ?? []) as Array<Record<string, unknown>>) {
      const lid = String(it.lesson_id);
      lessonIds.push(lid);
      itemMap.set(String(it.id), { title: String(it.title ?? ''), lesson_id: lid });
    }

    const lessonMap = new Map<string, string>();
    const uniqLessonIds = Array.from(new Set(lessonIds));
    if (uniqLessonIds.length > 0) {
      const { data: lessonRows, error: lErr } = await this.sb
        .from('lessons')
        .select('id, title')
        .in('id', uniqLessonIds);
      if (lErr) throw normalizeError(lErr);
      for (const l of (lessonRows ?? []) as Array<{ id: string; title: string }>) {
        lessonMap.set(String(l.id), l.title);
      }
    }

    const qqMap = new Map<string, string>();
    for (const q of (qqRes.data ?? []) as Array<{ id: string; prompt: string }>) {
      qqMap.set(String(q.id), q.prompt);
    }

    const optMap = new Map<string, string>();
    for (const o of (optsRes.data ?? []) as Array<{ id: string; text: string }>) {
      optMap.set(String(o.id), o.text);
    }

    const progress: StudentItemProgress[] = progRows.map((row) => {
      const itemId = String(row.item_id);
      const item = itemMap.get(itemId);
      const lessonId = item?.lesson_id ?? '';
      return {
        item_id: itemId,
        item_title: item?.title ?? itemId,
        lesson_id: lessonId,
        lesson_title: lessonMap.get(lessonId) ?? '—',
        completed_at: String(row.completed_at ?? row.updated_at ?? ''),
      };
    });

    const quickAnswers: StudentQuickAnswer[] = ansRows.map((row) => {
      const qId = String(row.question_id);
      const oId = String(row.option_id ?? '');
      return {
        id: qId,
        question_id: qId,
        prompt: qqMap.get(qId) ?? qId,
        selected_option_text: optMap.get(oId) ?? '—',
        is_correct: Boolean(row.is_correct),
        answered_at: String(row.answered_at ?? ''),
      };
    });

    return { progress, quickAnswers };
  }

  async getStudentExams(studentId: string): Promise<{
    attempts: ExamAttempt[];
    results: ExamResultRow[];
  }> {
    const [attRes, resRes] = await Promise.all([
      this.sb
        .from('exam_attempts')
        .select('id, exam_id, session_id, student_id, status, started_at, submitted_at')
        .eq('student_id', studentId),
      this.sb.from('exam_results').select(EXAM_RESULT_COLS).eq('student_id', studentId),
    ]);
    if (attRes.error) throw normalizeError(attRes.error);
    if (resRes.error) throw normalizeError(resRes.error);

    const resRows = (resRes.data ?? []) as Array<Record<string, unknown>>;
    const examIds = Array.from(new Set(resRows.map((r) => String(r.exam_id)).filter(Boolean)));
    const examTitleMap = new Map<string, string>();
    if (examIds.length > 0) {
      const { data: exRows, error: exErr } = await this.sb
        .from('exams')
        .select('id, title')
        .in('id', examIds);
      if (exErr) throw normalizeError(exErr);
      for (const e of (exRows ?? []) as Array<{ id: string; title: string }>) {
        examTitleMap.set(String(e.id), e.title);
      }
    }

    const attempts: ExamAttempt[] = ((attRes.data ?? []) as Array<Record<string, unknown>>).map((a) => ({
      id: String(a.id),
      exam_id: String(a.exam_id),
      session_id: String(a.session_id),
      student_id: String(a.student_id),
      status: a.status as AttemptStatus,
      started_at: String(a.started_at ?? ''),
      submitted_at: (a.submitted_at as string | null) ?? null,
    }));

    const results: ExamResultRow[] = resRows.map((r) =>
      mapExamResult(r, undefined, examTitleMap.get(String(r.exam_id)))
    );

    return { attempts, results };
  }

  async getStudentDevices(studentId: string): Promise<DeviceSession[]> {
    const { data, error } = await this.sb
      .from('device_sessions')
      .select(DEVICE_SESSION_COLS)
      .eq('user_id', studentId)
      .order('last_seen_at', { ascending: false });
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const plat = r.platform === 'android' ? 'android' : 'web';
      return {
        id: String(r.id),
        student_id: String(r.user_id),
        device_id: String(r.device_id ?? ''),
        device_label: String(r.platform ?? (plat === 'android' ? 'تطبيق أندرويد' : 'متصفح ويب')),
        platform: plat,
        is_active: r.ended_at === null,
        last_seen_at: String(r.last_seen_at ?? ''),
        created_at: String(r.started_at ?? ''),
      };
    });
  }

  async extendTrial(studentId: string, days: number): Promise<void> {
    const { error } = await this.sb.rpc('extend_trial', { p_student: studentId, p_days: days });
    if (error) throw normalizeError(error);
  }

  async setStudentBlocked(studentId: string, blocked: boolean, reason?: string): Promise<void> {
    const { error } = await this.sb.rpc('set_student_blocked', {
      p_student: studentId,
      p_blocked: blocked,
      p_reason: reason ?? null,
    });
    if (error) throw normalizeError(error);
  }

  async changeStudentTrack(studentId: string, trackId: string): Promise<void> {
    const { error } = await this.sb.rpc('change_student_track', {
      p_student: studentId,
      p_track: Number(trackId),
    });
    if (error) throw normalizeError(error);
  }

  async updateStudentLocation(
    studentId: string,
    governorateId: string,
    administrationId: string | null
  ): Promise<void> {
    const { error } = await this.sb.rpc('update_student_location', {
      p_student: studentId,
      p_governorate: Number(governorateId),
      p_administration: administrationId ? Number(administrationId) : null,
    });
    if (error) throw normalizeError(error);
  }

  async resetStudentSession(studentId: string): Promise<void> {
    const { error } = await this.sb.rpc('reset_student_session', { p_student: studentId });
    if (error) throw normalizeError(error);
  }

  async getExams(filter?: { courseId?: string; termId?: string; status?: string }): Promise<Exam[]> {
    let q = this.sb.from('exams').select(EXAM_COLS).order('created_at', { ascending: false });
    if (filter?.courseId) q = q.eq('course_id', Number(filter.courseId));
    if (filter?.termId) q = q.eq('term_id', Number(filter.termId));
    if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
    const { data, error } = await q;
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapExam);
  }

  async getExamDetail(examId: string): Promise<ExamDetailData> {
    const { data: examData, error } = await this.sb.from('exams').select(EXAM_COLS).eq('id', examId).single();
    if (error) throw normalizeError(error);
    const exam = mapExam(examData as Record<string, unknown>);

    const [courseRes, termRes, tcs, tracks, stages, qRes, sRes, resCount] = await Promise.all([
      this.sb.from('courses').select(COURSE_COLS).eq('id', Number(exam.course_id)).single(),
      this.sb.from('terms').select(TERM_COLS).eq('id', Number(exam.term_id)).single(),
      this.getTrackCourses(),
      this.getTracks(),
      this.getStages(),
      this.sb
        .from('exam_questions')
        .select('id, exam_id, position, type, prompt_html, points, created_at, question_options(id, question_id, position, text_html, is_correct)')
        .eq('exam_id', examId)
        .order('position'),
      this.sb.from('exam_sessions').select(EXAM_SESSION_COLS).eq('exam_id', examId).order('starts_at'),
      this.sb.from('exam_results').select('attempt_id', { count: 'exact', head: true }).eq('exam_id', examId),
    ]);
    if (courseRes.error) throw normalizeError(courseRes.error);
    if (termRes.error) throw normalizeError(termRes.error);
    if (qRes.error) throw normalizeError(qRes.error);
    if (sRes.error) throw normalizeError(sRes.error);
    if (resCount.error) throw normalizeError(resCount.error);

    const sessions: ExamSession[] = ((sRes.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
      id: String(s.id),
      exam_id: String(s.exam_id),
      name: String(s.name ?? ''),
      starts_at: String(s.starts_at ?? ''),
      ends_at: String(s.ends_at ?? ''),
    }));
    const sessionIds = sessions.map((s) => s.id);
    let audiences: SessionAudience[] = [];
    if (sessionIds.length > 0) {
      const audRes = await this.sb
        .from('session_audience')
        .select(SESSION_AUDIENCE_COLS)
        .in('session_id', sessionIds);
      if (audRes.error) throw normalizeError(audRes.error);
      audiences = ((audRes.data ?? []) as Array<Record<string, unknown>>).map(mapSessionAudience);
    }

    const linkedTracks = tcs
      .filter((tc) => tc.course_id === exam.course_id)
      .map((tc) => {
        const track = tracks.find((t) => t.id === tc.track_id);
        const stage = track ? stages.find((s) => s.id === track.stage_id) : undefined;
        return track && stage ? { track, stage } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const now = Date.now();
    return {
      exam,
      course: mapCourse(courseRes.data as Record<string, unknown>),
      term: mapTerm(termRes.data as Record<string, unknown>),
      tracks: linkedTracks,
      questions: ((qRes.data ?? []) as Array<Record<string, unknown>>).map(mapExamQuestion),
      sessions,
      audiences,
      isLocked: sessions.some((s) => new Date(s.starts_at).getTime() <= now),
      isApproved: (resCount.count ?? 0) > 0,
    };
  }

  async createExam(input: {
    course_id: string;
    term_id: string;
    title: string;
    description: string | null;
    duration_minutes: number;
    late_entry_minutes: number;
    disconnect_grace_seconds: number;
  }): Promise<Exam> {
    const { data, error } = await this.sb
      .from('exams')
      .insert({
        course_id: Number(input.course_id),
        term_id: Number(input.term_id),
        title: input.title,
        description: input.description,
        duration_minutes: input.duration_minutes,
        late_entry_minutes: input.late_entry_minutes,
        disconnect_grace_seconds: input.disconnect_grace_seconds,
        status: 'draft',
      })
      .select(EXAM_COLS)
      .single();
    return mapExam(unwrap(data as Record<string, unknown> | null, error));
  }

  async updateExam(
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
  ): Promise<Exam> {
    const { data, error } = await this.sb
      .from('exams')
      .update({
        course_id: Number(input.course_id),
        term_id: Number(input.term_id),
        title: input.title,
        description: input.description,
        duration_minutes: input.duration_minutes,
        late_entry_minutes: input.late_entry_minutes,
        disconnect_grace_seconds: input.disconnect_grace_seconds,
      })
      .eq('id', examId)
      .select(EXAM_COLS)
      .single();
    return mapExam(unwrap(data as Record<string, unknown> | null, error));
  }

  async setExamStatus(examId: string, status: ExamStatus): Promise<Exam> {
    const { data, error } = await this.sb
      .from('exams')
      .update({ status })
      .eq('id', examId)
      .select(EXAM_COLS)
      .single();
    return mapExam(unwrap(data as Record<string, unknown> | null, error));
  }

  async upsertExamQuestion(input: {
    id?: string;
    exam_id: string;
    question_type: QuestionType;
    prompt_html: string;
    points: number;
    options: Array<{ option_text: string; is_correct: boolean; sort_order: number }>;
  }): Promise<ExamQuestion> {
    let qId = input.id;
    let qRow: Record<string, unknown>;

    if (!qId) {
      const { data: maxRow, error: mErr } = await this.sb
        .from('exam_questions')
        .select('position')
        .eq('exam_id', input.exam_id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mErr) throw normalizeError(mErr);
      const pos = ((maxRow?.position as number | undefined) ?? 0) + 1;
      const { data, error } = await this.sb
        .from('exam_questions')
        .insert({
          exam_id: input.exam_id,
          position: pos,
          type: input.question_type,
          prompt_html: sanitizeArticleHtml(input.prompt_html),
          points: input.points,
        })
        .select(EXAM_QUESTION_COLS)
        .single();
      if (error) throw normalizeError(error);
      qRow = data as Record<string, unknown>;
      qId = String(qRow.id);
    } else {
      const { data, error } = await this.sb
        .from('exam_questions')
        .update({
          type: input.question_type,
          prompt_html: sanitizeArticleHtml(input.prompt_html),
          points: input.points,
        })
        .eq('id', qId)
        .select(EXAM_QUESTION_COLS)
        .single();
      if (error) throw normalizeError(error);
      qRow = data as Record<string, unknown>;
      const { error: delErr } = await this.sb.from('question_options').delete().eq('question_id', qId);
      if (delErr) throw normalizeError(delErr);
    }

    let insertedOpts: Array<Record<string, unknown>> = [];
    if (input.question_type === 'mcq' && input.options.length > 0) {
      const { data: optData, error: optErr } = await this.sb
        .from('question_options')
        .insert(
          input.options.map((o, idx) => ({
            question_id: qId,
            text_html: o.option_text,
            is_correct: o.is_correct,
            position: idx + 1,
          }))
        )
        .select('id, question_id, position, text_html, is_correct');
      if (optErr) throw normalizeError(optErr);
      insertedOpts = (optData ?? []) as Array<Record<string, unknown>>;
    }
    return mapExamQuestion({ ...qRow, question_options: insertedOpts });
  }

  async bulkImportExamQuestions(
    examId: string,
    questions: Array<{
      question_type: QuestionType;
      prompt_html: string;
      points: number;
      options: Array<{ option_text: string; is_correct: boolean; sort_order: number }>;
    }>
  ): Promise<number> {
    const { data: maxRow, error: mErr } = await this.sb
      .from('exam_questions')
      .select('position')
      .eq('exam_id', examId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (mErr) throw normalizeError(mErr);
    let pos = ((maxRow?.position as number | undefined) ?? 0) + 1;

    const { data: insertedQuestions, error: qErr } = await this.sb
      .from('exam_questions')
      .insert(
        questions.map((q) => ({
          exam_id: examId,
          position: pos++,
          type: q.question_type,
          prompt_html: sanitizeArticleHtml(q.prompt_html),
          points: q.points,
        }))
      )
      .select(EXAM_QUESTION_COLS);

    if (qErr) throw normalizeError(qErr);
    const created = ((insertedQuestions ?? []) as Array<Record<string, unknown>>).map(mapExamQuestion);

    const optionRows: Array<{
      question_id: string;
      text_html: string;
      is_correct: boolean;
      position: number;
    }> = [];

    created.forEach((cq, idx) => {
      const src = questions[idx];
      if (src?.question_type === 'mcq') {
        src.options.forEach((o, oi) => {
          optionRows.push({
            question_id: cq.id,
            text_html: o.option_text,
            is_correct: o.is_correct,
            position: oi + 1,
          });
        });
      }
    });

    if (optionRows.length > 0) {
      const { error: oErr } = await this.sb.from('question_options').insert(optionRows);
      if (oErr) {
        await this.sb
          .from('exam_questions')
          .delete()
          .in(
            'id',
            created.map((c) => c.id)
          );
        throw normalizeError(oErr);
      }
    }
    return created.length;
  }

  async deleteExamQuestion(_examId: string, questionId: string): Promise<void> {
    const { error } = await this.sb.from('exam_questions').delete().eq('id', questionId);
    if (error) throw normalizeError(error);
  }

  async reorderExamQuestions(
    _examId: string,
    rows: Array<{
      id: string;
      exam_id: string;
      question_type: QuestionType;
      position: number;
      prompt_html: string;
      points: number;
    }>
  ): Promise<void> {
    const { error } = await this.sb.from('exam_questions').upsert(
      rows.map((r) => ({
        id: r.id,
        exam_id: r.exam_id,
        type: r.question_type,
        position: r.position,
        prompt_html: r.prompt_html,
        points: r.points,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new AppError('REORDER_FAILED');
  }

  async createExamSession(input: {
    exam_id: string;
    name: string;
    starts_at: string;
    audiences: Array<{
      governorate_id: string | null;
      administration_id: string | null;
      track_id: string | null;
    }>;
  }): Promise<ExamSession> {
    const { data: sess, error } = await this.sb
      .from('exam_sessions')
      .insert({ exam_id: input.exam_id, name: input.name, starts_at: input.starts_at })
      .select(EXAM_SESSION_COLS)
      .single();
    if (error) throw normalizeError(error);
    const created = sess as ExamSession;
    const { error: aErr } = await this.sb.from('session_audience').insert(
      input.audiences.map((a) => ({
        session_id: created.id,
        governorate_id: a.governorate_id ? Number(a.governorate_id) : null,
        administration_id: a.administration_id ? Number(a.administration_id) : null,
        track_id: a.track_id ? Number(a.track_id) : null,
      }))
    );
    if (aErr) {
      await this.sb.from('exam_sessions').delete().eq('id', created.id);
      throw normalizeError(aErr);
    }
    return created;
  }

  async deleteExamSession(_examId: string, sessionId: string): Promise<void> {
    const { error } = await this.sb.from('exam_sessions').delete().eq('id', sessionId);
    if (error) throw normalizeError(error);
  }

  async getExamMonitoring(examId: string): Promise<ExamSessionStatRow[]> {
    const { data, error } = await this.sb
      .from('v_exam_session_stats')
      .select(
        'exam_id, session_id, name, starts_at, ends_at, attempts_total, in_progress, submitted, auto_submitted'
      )
      .eq('exam_id', examId);
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      session_id: String(r.session_id ?? ''),
      exam_id: String(r.exam_id ?? examId),
      session_name: String(r.name ?? '—'),
      starts_at: String(r.starts_at ?? ''),
      ends_at: String(r.ends_at ?? ''),
      eligible_count: 0,
      total_attempts: Number(r.attempts_total ?? 0),
      in_progress_count: Number(r.in_progress ?? 0),
      submitted_count: Number(r.submitted ?? 0),
      auto_submitted_count: Number(r.auto_submitted ?? 0),
    }));
  }

  async getQuestionStats(examId: string): Promise<QuestionStatRow[]> {
    const [rpcRes, qRes] = await Promise.all([
      this.sb.rpc('question_stats', { p_exam_id: examId }),
      this.sb.from('exam_questions').select('id, prompt_html').eq('exam_id', examId),
    ]);
    if (rpcRes.error) throw normalizeError(rpcRes.error);
    if (qRes.error) throw normalizeError(qRes.error);

    const promptMap = new Map<string, string>();
    for (const q of (qRes.data ?? []) as Array<{ id: string; prompt_html: string }>) {
      promptMap.set(String(q.id), q.prompt_html ?? '');
    }

    return ((rpcRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const qId = String(r.question_id);
      return {
        question_id: qId,
        position: Number(r.q_position ?? 0),
        question_type: r.type as QuestionType,
        prompt_html: promptMap.get(qId) ?? '',
        points: Number(r.points ?? 0),
        attempts_count: Number(r.attempts ?? 0),
        answered_count: Number(r.answered ?? 0),
        correct_count: Number(r.correct ?? 0),
        correct_pct: r.pct_correct != null ? Number(r.pct_correct) : null,
        avg_essay_score: r.avg_essay != null ? Number(r.avg_essay) : null,
      };
    });
  }

  async getGradingBatches(examId: string): Promise<GradingBatch[]> {
    const { data, error } = await this.sb
      .from('grading_batches')
      .select(GRADING_BATCH_COLS)
      .eq('exam_id', examId)
      .order('exported_at', { ascending: false });
    if (error) throw normalizeError(error);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const staffMap = await this.fetchStaffNameMap(
      rows.map((r) => (r.exported_by != null ? String(r.exported_by) : '')).filter(Boolean)
    );
    return rows.map((r) =>
      mapGradingBatch(r, r.exported_by != null ? staffMap.get(String(r.exported_by)) : undefined)
    );
  }

  async exportGrading(examId: string): Promise<{ batch: GradingBatch; rows: GradingExportRow[] }> {
    const { data, error } = await this.sb.rpc('export_grading', { p_exam_id: examId });
    if (error) throw normalizeError(error);
    const rawRows = (data ?? []) as Array<Record<string, unknown>>;
    const rows: GradingExportRow[] = rawRows.map((r) => ({
      answer_code: String(r.answer_code ?? ''),
      question_position: Number(r.question_position ?? 0),
      question_text: String(r.question_text ?? ''),
      answer_text: String(r.answer_text ?? ''),
      max_points: Number(r.max_points ?? 0),
      score: r.current_score != null ? Number(r.current_score) : null,
    }));

    const batchId = rawRows[0]?.batch_id != null ? String(rawRows[0].batch_id) : '';
    let batch: GradingBatch;
    if (batchId) {
      const { data: bRow, error: bErr } = await this.sb
        .from('grading_batches')
        .select(GRADING_BATCH_COLS)
        .eq('id', batchId)
        .single();
      if (bErr) throw normalizeError(bErr);
      batch = mapGradingBatch(bRow as Record<string, unknown>);
    } else {
      const existing = await this.getGradingBatches(examId);
      batch = existing[0] ?? {
        id: '',
        exam_id: examId,
        exported_by: '',
        exported_at: new Date().toISOString(),
        imported_at: null,
        ai_graded: false,
        rows_count: 0,
      };
    }

    return { batch, rows };
  }

  async importGrades(batchId: string, rows: GradeImportRow[], aiGraded: boolean): Promise<void> {
    const { error } = await this.sb.rpc('import_grades', {
      p_batch_id: batchId,
      p_rows: rows,
      p_ai: aiGraded,
    });
    if (error) throw normalizeError(error);
  }

  async approveGrading(examId: string): Promise<void> {
    const { error } = await this.sb.rpc('approve_grading', { p_exam_id: examId });
    if (error) throw normalizeError(error);
  }

  async getExamResults(examId: string): Promise<ExamResultRow[]> {
    const { data, error } = await this.sb
      .from('exam_results')
      .select(EXAM_RESULT_COLS)
      .eq('exam_id', examId)
      .order('total_score', { ascending: false });
    if (error) throw normalizeError(error);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) return [];

    const studentIds = Array.from(new Set(rows.map((r) => String(r.student_id)).filter(Boolean)));
    const [profilesRes, examRes] = await Promise.all([
      studentIds.length > 0
        ? this.sb.from('profiles').select('id, full_name, phone').in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      this.sb.from('exams').select('id, title').eq('id', examId).maybeSingle(),
    ]);
    if (profilesRes.error) throw normalizeError(profilesRes.error);
    if (examRes.error) throw normalizeError(examRes.error);

    const profileMap = new Map<string, { full_name: string; phone: string }>();
    for (const p of (profilesRes.data ?? []) as Array<{ id: string; full_name: string; phone: string }>) {
      profileMap.set(p.id, { full_name: p.full_name, phone: p.phone });
    }
    const examTitle = (examRes.data as { title?: string } | null)?.title;

    return rows.map((r) => mapExamResult(r, profileMap.get(String(r.student_id)), examTitle));
  }

  async listEssayAnswersAdmin(examId: string): Promise<EssayAnswerAdminRow[]> {
    const [rpcRes, qRes] = await Promise.all([
      this.sb.rpc('list_essay_answers', { p_exam_id: examId }),
      this.sb.from('exam_questions').select('position, prompt_html').eq('exam_id', examId),
    ]);
    if (rpcRes.error) throw normalizeError(rpcRes.error);
    if (qRes.error) throw normalizeError(qRes.error);

    const qTextByPos = new Map<number, string>();
    for (const q of (qRes.data ?? []) as Array<{ position: number; prompt_html: string }>) {
      qTextByPos.set(Number(q.position), String(q.prompt_html ?? '').replace(/<[^>]+>/g, ' ').trim());
    }

    return ((rpcRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
      const pos = Number(r.question_position ?? 0);
      return {
        answer_id: String(r.answer_id),
        attempt_id: '',
        student_id: '',
        student_name: String(r.student_name ?? '—'),
        question_id: '',
        question_position: pos,
        question_text: qTextByPos.get(pos) || `سؤال #${pos}`,
        answer_text: String(r.answer_text ?? ''),
        max_points: Number(r.max_points ?? 0),
        score: Number(r.score ?? 0),
        adjust_reason: r.source === 'manual' ? 'تعديل يدوي' : null,
      };
    });
  }

  async adjustEssayGrade(answerId: string, score: number, reason: string): Promise<void> {
    const { error } = await this.sb.rpc('adjust_essay_grade', {
      p_answer_id: answerId,
      p_score: score,
      p_reason: reason,
    });
    if (error) throw normalizeError(error);
  }

  async getAnnouncements(filter?: {
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Announcement>> {
    const [from, to] = getRange(filter?.page ?? 1, filter?.pageSize ?? 25);
    const { data, count, error } = await this.sb
      .from('announcements')
      .select(ANNOUNCEMENT_COLS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw normalizeError(error);
    const raw = (data ?? []) as Array<Record<string, unknown>>;

    const [tracks, govs] = await Promise.all([
      raw.some((a) => a.track_id != null) ? this.getTracks() : Promise.resolve([]),
      raw.some((a) => a.governorate_id != null) ? this.getGovernorates() : Promise.resolve([]),
    ]);
    const trackMap = new Map(tracks.map((t) => [t.id, t.name_ar]));
    const govMap = new Map(govs.map((g) => [g.id, g.name_ar]));

    const items: Announcement[] = raw.map((a) => {
      const tId = a.track_id != null ? String(a.track_id) : null;
      const gId = a.governorate_id != null ? String(a.governorate_id) : null;
      return {
        id: String(a.id),
        title: String(a.title ?? ''),
        body: String(a.body ?? ''),
        track_id: tId,
        track_name: tId ? (trackMap.get(tId) ?? null) : null,
        governorate_id: gId,
        governorate_name: gId ? (govMap.get(gId) ?? null) : null,
        recipients_count: Number(a.recipients ?? 0),
        sent_by: a.created_by != null ? String(a.created_by) : '',
        created_at: String(a.created_at ?? ''),
      };
    });
    return { items, total: count ?? 0 };
  }

  async countAnnouncementRecipients(
    trackId: string | null,
    governorateId: string | null
  ): Promise<number> {
    let q = this.sb.from('profiles').select('id', { count: 'exact', head: true }).eq('is_blocked', false);
    if (trackId) q = q.eq('track_id', Number(trackId));
    if (governorateId) q = q.eq('governorate_id', Number(governorateId));
    const { count, error } = await q;
    if (error) throw normalizeError(error);
    return count ?? 0;
  }

  async sendAnnouncement(input: {
    title: string;
    body: string;
    track_id: string | null;
    governorate_id: string | null;
  }): Promise<Announcement> {
    const { data, error } = await this.sb.rpc('send_announcement', {
      p_title: input.title,
      p_body: input.body,
      p_track: input.track_id ? Number(input.track_id) : null,
      p_governorate: input.governorate_id ? Number(input.governorate_id) : null,
    });
    const recipientsCount = unwrap(data as number | null, error);

    const { data: latestRow } = await this.sb
      .from('announcements')
      .select(ANNOUNCEMENT_COLS)
      .eq('title', input.title)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRow) {
      const a = latestRow as Record<string, unknown>;
      return {
        id: String(a.id),
        title: String(a.title ?? input.title),
        body: String(a.body ?? input.body),
        track_id: a.track_id != null ? String(a.track_id) : null,
        governorate_id: a.governorate_id != null ? String(a.governorate_id) : null,
        recipients_count: Number(a.recipients ?? recipientsCount),
        sent_by: a.created_by != null ? String(a.created_by) : '',
        created_at: String(a.created_at ?? new Date().toISOString()),
      };
    }

    return {
      id: '',
      title: input.title,
      body: input.body,
      track_id: input.track_id,
      governorate_id: input.governorate_id,
      recipients_count: Number(recipientsCount),
      sent_by: '',
      created_at: new Date().toISOString(),
    };
  }

  async getReportsBundle(filter: ReportsFilter): Promise<ReportBundle> {
    const CAP = 20000;
    const [payRes, subRes, stuRes, lesRes, exRes, resRes, progRes, ansTotalRes, ansCorrectRes] =
      await Promise.all([
        this.getPaymentQueue({
          status: 'approved',
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          termId: filter.termId,
          trackId: filter.trackId,
          page: 1,
          pageSize: 1000,
        }),
        this.getSubscriptions({
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          termId: filter.termId,
          trackId: filter.trackId,
          stageId: filter.stageId,
          page: 1,
          pageSize: 1000,
        }),
        this.getStudents({
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          trackId: filter.trackId,
          stageId: filter.stageId,
          page: 1,
          pageSize: 1000,
        }),
        this.getLessons({
          termId: filter.termId,
          trackId: filter.trackId,
          stageId: filter.stageId,
          page: 1,
          pageSize: 1000,
        }),
        this.getExams({ termId: filter.termId }),
        this.sb.from('exam_results').select(EXAM_RESULT_COLS).limit(1000),
        this.sb.from('item_progress').select('student_id', { count: 'exact', head: true }),
        this.sb.from('quick_answers').select('student_id', { count: 'exact', head: true }),
        this.sb
          .from('quick_answers')
          .select('student_id', { count: 'exact', head: true })
          .eq('is_correct', true),
      ]);
    if (resRes.error) throw normalizeError(resRes.error);
    if (progRes.error) throw normalizeError(progRes.error);
    if (ansTotalRes.error) throw normalizeError(ansTotalRes.error);
    if (ansCorrectRes.error) throw normalizeError(ansCorrectRes.error);

    const rawResults = (resRes.data ?? []) as Array<Record<string, unknown>>;
    const studentIds = Array.from(new Set(rawResults.map((r) => String(r.student_id)).filter(Boolean)));
    const examIds = Array.from(new Set(rawResults.map((r) => String(r.exam_id)).filter(Boolean)));

    const [profilesRes, examsLookupRes] = await Promise.all([
      studentIds.length > 0
        ? this.sb.from('profiles').select('id, full_name, phone').in('id', studentIds)
        : Promise.resolve({ data: [], error: null }),
      examIds.length > 0
        ? this.sb.from('exams').select('id, title').in('id', examIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (profilesRes.error) throw normalizeError(profilesRes.error);
    if (examsLookupRes.error) throw normalizeError(examsLookupRes.error);

    const profileMap = new Map<string, { full_name: string; phone: string }>();
    for (const p of (profilesRes.data ?? []) as Array<{ id: string; full_name: string; phone: string }>) {
      profileMap.set(p.id, { full_name: p.full_name, phone: p.phone });
    }
    const examTitleMap = new Map<string, string>();
    for (const e of (examsLookupRes.data ?? []) as Array<{ id: string; title: string }>) {
      examTitleMap.set(String(e.id), e.title);
    }

    const results: ExamResultRow[] = rawResults.map((r) =>
      mapExamResult(r, profileMap.get(String(r.student_id)), examTitleMap.get(String(r.exam_id)))
    );

    const totalFetched = payRes.total + subRes.total + stuRes.total;
    return {
      truncated: totalFetched > CAP,
      totalFetched,
      payments: payRes.items,
      subscriptions: subRes.items,
      students: stuRes.items,
      lessons: lesRes.items,
      exams: exRes,
      results,
      itemProgressCount: progRes.count ?? 0,
      quickAnswersStats: {
        total: ansTotalRes.count ?? 0,
        correct: ansCorrectRes.count ?? 0,
      },
    };
  }

  async getStaffList(): Promise<StaffProfile[]> {
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      this.sb
        .from('staff_profiles')
        .select('user_id, full_name, created_at, updated_at')
        .order('created_at'),
      this.sb.from('staff_roles').select('user_id, role'),
    ]);
    if (pErr) throw normalizeError(pErr);
    if (rErr) throw normalizeError(rErr);

    const roleRows = (roles ?? []) as Array<{ user_id: string; role: StaffRole }>;
    const profileRows = (profiles ?? []) as Array<{
      user_id: string;
      full_name: string;
      created_at: string;
      updated_at: string;
    }>;

    return profileRows.map((p) => ({
      id: p.user_id,
      email: '',
      full_name: p.full_name,
      is_active: true,
      created_at: p.created_at,
      roles: roleRows.filter((r) => r.user_id === p.user_id).map((r) => r.role),
    }));
  }

  async createStaffMember(input: {
    email: string;
    full_name: string;
    password: string;
    roles: StaffRole[];
  }): Promise<StaffProfile> {
    const { data, error } = await this.sb.functions.invoke('create-staff', { body: input });
    if (error) throw normalizeError(error);
    return data as StaffProfile;
  }

  async updateStaffRoles(staffId: string, roles: StaffRole[]): Promise<void> {
    const { data: currentRows, error: fetchErr } = await this.sb
      .from('staff_roles')
      .select('role')
      .eq('user_id', staffId);
    if (fetchErr) throw normalizeError(fetchErr);

    const current = ((currentRows ?? []) as Array<{ role: StaffRole }>).map((r) => r.role);
    const toRemove = current.filter((r) => !roles.includes(r));
    const toAdd = roles.filter((r) => !current.includes(r));

    if (toRemove.length > 0) {
      const { error: delErr } = await this.sb
        .from('staff_roles')
        .delete()
        .eq('user_id', staffId)
        .in('role', toRemove);
      if (delErr) throw normalizeError(delErr);
    }

    if (toAdd.length > 0) {
      const { error: insErr } = await this.sb
        .from('staff_roles')
        .insert(toAdd.map((role) => ({ user_id: staffId, role })));
      if (insErr) throw normalizeError(insErr);
    }
  }

  async setStaffActive(_staffId: string, _isActive: boolean): Promise<void> {
    throw new AppError(
      'NOT_ALLOWED',
      'تعطيل/تفعيل الموظف غير مدعوم في مخطط قاعدة البيانات الحالي؛ يرجى تعديل أو سحب الأدوار الوظيفية.'
    );
  }

  async getAuditLog(filter: AuditFilter): Promise<PaginatedResult<AuditLogEntry>> {
    const [from, to] = getRange(filter.page ?? 1, filter.pageSize ?? 25);
    let q = this.sb
      .from('audit_log')
      .select(AUDIT_LOG_COLS, { count: 'exact' })
      .order('at', { ascending: false });
    if (filter.action) q = q.eq('action', filter.action);
    if (filter.entityType) q = q.eq('entity', filter.entityType);
    if (filter.actorId) q = q.eq('actor_id', filter.actorId);
    if (filter.fromDate) q = q.gte('at', filter.fromDate);
    if (filter.toDate) q = q.lte('at', filter.toDate);
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);

    const raw = (data ?? []) as Array<Record<string, unknown>>;
    const actorIds = raw.map((r) => (r.actor_id != null ? String(r.actor_id) : '')).filter(Boolean);
    const actorNameMap = await this.fetchStaffNameMap(actorIds);
    const items: AuditLogEntry[] = raw.map((r) => mapAuditRow(r, actorNameMap));
    return { items, total: count ?? 0 };
  }

  async getYearEndReports(): Promise<YearEndReport[]> {
    const { data, error } = await this.sb
      .from('year_end_reports')
      .select(YEAR_END_COLS)
      .order('generated_at', { ascending: false });
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<Record<string, unknown>>).map(mapYearEndReport);
  }

  async registerYearEndReport(
    academicYear: string,
    pdfPath: string,
    studentId?: string
  ): Promise<YearEndReport> {
    if (!studentId?.trim()) {
      throw new AppError('STUDENT_NOT_FOUND', 'يرجى تحديد الطالب المطلوب تسجيل التقرير السنوي له.');
    }
    const { data, error } = await this.sb.rpc('register_year_end_report', {
      p_student: studentId.trim(),
      p_year: academicYear,
      p_pdf_path: pdfPath,
    });
    const reportId = unwrap(data as string | null, error);
    const { data: row, error: fetchErr } = await this.sb
      .from('year_end_reports')
      .select(YEAR_END_COLS)
      .eq('id', reportId)
      .single();
    return mapYearEndReport(unwrap(row as Record<string, unknown> | null, fetchErr));
  }

  async purgeYearEndDetails(academicYear: string, confirmation: string): Promise<number> {
    const { data, error } = await this.sb.rpc('purge_year_end_details', {
      p_year: academicYear,
      p_confirm: confirmation,
    });
    return unwrap(data as number | null, error);
  }
}
