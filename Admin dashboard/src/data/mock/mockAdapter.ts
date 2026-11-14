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
  ImportErrorDetail,
  Lesson,
  LessonItem,
  LessonItemType,
  LessonStatus,
  LessonWithContext,
  LinkKind,
  PaginatedResult,
  PaymentQueueRow,
  Plan,
  QuestionStatRow,
  QuestionType,
  StaffProfile,
  StaffRole,
  Stage,
  StudentItemProgress,
  StudentOverviewRow,
  StudentQuickAnswer,
  Subscription,
  Term,
  Track,
  TrackCourse,
  YearEndReport,
} from '../types';
import { AppError } from '../../lib/errors';
import { hasPermission, requiresMfa, type Permission } from '../../lib/permissions';
import { checkLinkAgainstAllowedDomains, normalizeDomainString } from '../../lib/link-domains';
import { checkExamPublishable, checkLessonPublishable } from '../../lib/publish-checklist';
import { computeExamCoveragePreview } from '../../lib/exam-coverage';
import { ageDaysFromNow, diffDaysFromNow } from '../../lib/format';
import { sanitizeArticleHtml } from '../../lib/sanitize';
import { createInitialMockDatabase, type MockDatabase, type MockStudentRecord } from './seed';

const STORAGE_KEY = 'thanawya_admin_mock_session_v1';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function paginate<T>(items: T[], page = 1, pageSize = 25): PaginatedResult<T> {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
  };
}

export class MockAdminApi implements AdminApi {
  private db: MockDatabase;
  private session: AuthSessionState | null = null;

  constructor() {
    this.db = createInitialMockDatabase();
    if (typeof window !== 'undefined') {
      try {
        const saved = window.sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          this.session = JSON.parse(saved) as AuthSessionState;
        }
      } catch {
        this.session = null;
      }
    }
  }

  public resetMockState(): void {
    this.db = createInitialMockDatabase();
  }

  private persistSession(): void {
    if (typeof window !== 'undefined') {
      if (this.session) {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.session));
      } else {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }

  private requireAuth(): AuthSessionState {
    if (!this.session) {
      throw new AppError('UNAUTHENTICATED');
    }
    if (this.session.roles.length === 0) {
      throw new AppError('NOT_ALLOWED');
    }
    if (this.session.mfaRequired && !this.session.mfaVerified) {
      throw new AppError('NOT_ALLOWED', 'يجب إكمال التحقق الثنائي (MFA) أولًا.');
    }
    return this.session;
  }

  private requirePerm(perm: Permission): AuthSessionState {
    const sess = this.requireAuth();
    if (!hasPermission(sess.roles, perm)) {
      throw new AppError('NOT_ALLOWED');
    }
    return sess;
  }

  private writeAudit(
    actor: AuthSessionState,
    action: string,
    entity_type: string,
    entity_id: string,
    details: Record<string, unknown> = {}
  ): void {
    const entry: AuditLogEntry = {
      id: uid('aud'),
      actor_id: actor.userId,
      actor_name: actor.profile?.full_name ?? actor.email,
      action,
      entity_type,
      entity_id,
      details,
      created_at: new Date().toISOString(),
    };
    this.db.auditLog.unshift(entry);
  }

  private buildStudentOverview(s: MockStudentRecord): StudentOverviewRow {
    const gov = this.db.governorates.find((g) => g.id === s.governorate_id);
    const adm = s.administration_id
      ? this.db.administrations.find((a) => a.id === s.administration_id)
      : undefined;
    const track = this.db.tracks.find((t) => t.id === s.track_id);
    const stage = track ? this.db.stages.find((st) => st.id === track.stage_id) : undefined;
    const activeSubs = this.db.subscriptions.filter(
      (sub) =>
        sub.student_id === s.id &&
        sub.status === 'active' &&
        new Date(sub.ends_at).getTime() > Date.now()
    ).length;

    return {
      id: s.id,
      full_name: s.full_name,
      phone: s.phone,
      guardian_phone: s.guardian_phone,
      governorate_id: s.governorate_id,
      governorate_name: gov?.name_ar ?? '—',
      administration_id: s.administration_id,
      administration_name: adm?.name_ar ?? null,
      stage_id: stage?.id ?? '',
      stage_name: stage?.name_ar ?? '—',
      track_id: s.track_id,
      track_name: track?.name_ar ?? '—',
      trial_ends_at: s.trial_ends_at,
      trial_days_left: Math.max(0, diffDaysFromNow(s.trial_ends_at)),
      active_subscriptions_count: activeSubs,
      is_blocked: s.is_blocked,
      block_reason: s.block_reason,
      created_at: s.created_at,
    };
  }

  private buildPaymentRow(p: MockDatabase['paymentRequests'][number]): PaymentQueueRow {
    const student = this.db.students.find((s) => s.id === p.student_id);
    const gov = student ? this.db.governorates.find((g) => g.id === student.governorate_id) : undefined;
    const track = this.db.tracks.find((t) => t.id === p.track_id);
    const term = this.db.terms.find((t) => t.id === p.term_id);
    const reviewer = p.reviewed_by
      ? this.db.staff.find((st) => st.id === p.reviewed_by)
      : undefined;
    const activeSubs = this.db.subscriptions.filter(
      (sub) => sub.student_id === p.student_id && sub.status === 'active'
    ).length;
    const prevCount = this.db.paymentRequests.filter(
      (req) => req.student_id === p.student_id && req.id !== p.id
    ).length;

    return {
      id: p.id,
      student_id: p.student_id,
      student_name: student?.full_name ?? '—',
      student_phone: student?.phone ?? '—',
      governorate_name: gov?.name_ar ?? '—',
      track_id: p.track_id,
      track_name: track?.name_ar ?? '—',
      term_id: p.term_id,
      term_name: term?.name_ar ?? '—',
      term_access_ends_at: term?.access_ends_at ?? null,
      amount_egp: p.amount_egp,
      sender_phone: p.sender_phone,
      proof_path: p.proof_path,
      status: p.status,
      reviewed_by: p.reviewed_by,
      reviewer_name: reviewer?.full_name ?? null,
      reviewed_at: p.reviewed_at,
      reject_reason: p.reject_reason,
      created_at: p.created_at,
      student_trial_ends_at: student?.trial_ends_at ?? new Date().toISOString(),
      student_active_subscriptions_count: activeSubs,
      student_previous_requests_count: prevCount,
    };
  }

  private buildSubscriptionRow(sub: Subscription): Subscription {
    const stu = this.db.students.find((s) => s.id === sub.student_id);
    const track = this.db.tracks.find((t) => t.id === sub.track_id);
    const stage = track ? this.db.stages.find((st) => st.id === track.stage_id) : undefined;
    const term = this.db.terms.find((t) => t.id === sub.term_id);
    const isExpired = sub.status === 'active' && new Date(sub.ends_at).getTime() <= Date.now();
    return {
      ...sub,
      status: isExpired ? 'expired' : sub.status,
      student_name: stu?.full_name ?? '—',
      student_phone: stu?.phone ?? '—',
      track_name: track?.name_ar ?? '—',
      stage_id: stage?.id,
      stage_name: stage?.name_ar ?? '—',
      term_name: term?.name_ar ?? '—',
    };
  }

  private buildLessonWithContext(l: Lesson): LessonWithContext {
    const course = this.db.courses.find((c) => c.id === l.course_id);
    const term = this.db.terms.find((t) => t.id === l.term_id);
    const linkedTracks = this.db.trackCourses
      .filter((tc) => tc.course_id === l.course_id)
      .map((tc) => {
        const track = this.db.tracks.find((t) => t.id === tc.track_id);
        const stage = track ? this.db.stages.find((s) => s.id === track.stage_id) : undefined;
        return track && stage
          ? { track_id: track.id, track_name: track.name_ar, stage_id: stage.id, stage_name: stage.name_ar }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const items = this.db.lessonItems.filter((i) => i.lesson_id === l.id);
    return {
      ...l,
      course_name: course?.name_ar ?? '—',
      term_name: term?.name_ar ?? '—',
      tracks: linkedTracks,
      items_count: items.length,
      item_types: Array.from(new Set(items.map((i) => i.item_type))),
    };
  }

  // ---- Auth ----
  async getCurrentSession(): Promise<AuthSessionState | null> {
    return this.session;
  }

  async signIn(email: string, _password: string): Promise<AuthSessionState> {
    const normalized = email.trim().toLowerCase();
    if (normalized === 'norole@thanawya.edu.eg') {
      const noRoleSess: AuthSessionState = {
        userId: 'user-norole',
        email: normalized,
        profile: null,
        roles: [],
        mfaRequired: false,
        mfaVerified: true,
        mfaEnrolled: false,
        verifiedTotpFactorId: null,
        aalCurrentLevel: 'aal1',
        aalNextLevel: 'aal1',
      };
      this.session = noRoleSess;
      this.persistSession();
      return noRoleSess;
    }

    const found = this.db.staff.find((s) => s.email.toLowerCase() === normalized && s.is_active);
    if (!found) {
      throw new AppError('UNAUTHENTICATED', 'بيانات الدخول غير صحيحة أو الحساب معطّل.');
    }

    const mfaReq = requiresMfa(found.roles);
    this.session = {
      userId: found.id,
      email: found.email,
      profile: found,
      roles: found.roles,
      mfaRequired: mfaReq,
      mfaVerified: !mfaReq,
      mfaEnrolled: mfaReq,
      verifiedTotpFactorId: mfaReq ? `mock-factor-${found.id}` : null,
      aalCurrentLevel: 'aal1',
      aalNextLevel: mfaReq ? 'aal2' : 'aal1',
    };
    this.persistSession();
    return this.session;
  }

  async enrollMfa(): Promise<MfaEnrollmentData> {
    if (!this.session) throw new AppError('UNAUTHENTICATED');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff"/><rect x="12" y="12" width="32" height="32" fill="#0f172a"/><rect x="76" y="12" width="32" height="32" fill="#0f172a"/><rect x="12" y="76" width="32" height="32" fill="#0f172a"/><rect x="54" y="54" width="16" height="16" fill="#0f172a"/></svg>';
    return {
      factorId: `mock-factor-${this.session.userId}`,
      qrCode: `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`,
      secret: 'JBSWY3DPEHPK3PXP',
    };
  }

  async verifyMfa(code: string, factorId?: string): Promise<AuthSessionState> {
    if (!this.session) throw new AppError('UNAUTHENTICATED');
    if (code.trim() !== '123456') {
      throw new AppError('MFA_INVALID_CODE', 'رمز التحقق غير صحيح (استخدم 123456 في وضع المحاكاة).');
    }
    this.session = {
      ...this.session,
      mfaVerified: true,
      mfaEnrolled: true,
      verifiedTotpFactorId: factorId ?? this.session.verifiedTotpFactorId ?? `mock-factor-${this.session.userId}`,
      aalCurrentLevel: 'aal2',
      aalNextLevel: 'aal2',
    };
    this.persistSession();
    return this.session;
  }

  async signOut(): Promise<void> {
    this.session = null;
    this.persistSession();
  }

  // ---- Dashboard ----
  async getDashboardSummary(): Promise<DashboardSummary> {
    const sess = this.requirePerm('dashboard:view');
    const now = Date.now();
    const in7Days = now + 7 * 24 * 60 * 60 * 1000;
    const in24Hours = now + 24 * 60 * 60 * 1000;

    const pending = this.db.paymentRequests
      .filter((p) => p.status === 'pending')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const oldestPendingDays = pending[0] ? ageDaysFromNow(pending[0].created_at) : null;

    const inTrial = this.db.students.filter(
      (s) => !s.is_blocked && new Date(s.trial_ends_at).getTime() > now
    );
    const trialsEnding7 = inTrial.filter((s) => new Date(s.trial_ends_at).getTime() <= in7Days);

    const activeSubsByTerm = this.db.terms.map((t) => ({
      term_id: t.id,
      term_name: t.name_ar,
      count: this.db.subscriptions.filter(
        (sub) =>
          sub.term_id === t.id &&
          sub.status === 'active' &&
          new Date(sub.ends_at).getTime() > now
      ).length,
    }));

    const upcomingSessions24h = this.db.examSessions.filter((s) => {
      const st = new Date(s.starts_at).getTime();
      const en = new Date(s.ends_at).getTime();
      return (st >= now && st <= in24Hours) || (st <= now && en >= now);
    }).length;

    const attemptsInProgress = this.db.examAttempts.filter((a) => a.status === 'in_progress').length;

    const examsAwaitingGrading = this.db.exams.filter((ex) => {
      const exSessions = this.db.examSessions.filter((s) => s.exam_id === ex.id);
      const allEnded =
        exSessions.length > 0 && exSessions.every((s) => new Date(s.ends_at).getTime() <= now);
      const approved = this.db.examResults.some((r) => r.exam_id === ex.id);
      return ex.status === 'published' && allEnded && !approved;
    }).length;

    const termsMissingAccessEnd = this.db.terms.filter(
      (t) => !t.access_ends_at || new Date(t.access_ends_at).getTime() <= now
    );

    return {
      pendingPaymentsCount: pending.length,
      oldestPendingDays,
      studentsInTrialCount: inTrial.length,
      trialsEnding7DaysCount: trialsEnding7.length,
      activeSubscriptionsByTerm: activeSubsByTerm,
      blockedStudentsCount: this.db.students.filter((s) => s.is_blocked).length,
      upcomingSessions24hCount: upcomingSessions24h,
      attemptsInProgressCount: attemptsInProgress,
      examsAwaitingGradingCount: examsAwaitingGrading,
      lessonsPublishedCount: this.db.lessons.filter((l) => l.status === 'published').length,
      lessonsDraftCount: this.db.lessons.filter((l) => l.status === 'draft').length,
      termsMissingAccessEnd,
      recentAudit: hasPermission(sess.roles, 'audit:read') ? this.db.auditLog.slice(0, 10) : [],
    };
  }

  // ---- Reference / Academic ----
  async getGovernorates(): Promise<Governorate[]> {
    this.requirePerm('reference:read');
    return [...this.db.governorates].sort((a, b) => a.sort_order - b.sort_order);
  }

  async createGovernorate(input: { name_ar: string; sort_order: number }): Promise<Governorate> {
    this.requirePerm('reference:write');
    if (this.db.governorates.some((g) => g.name_ar === input.name_ar.trim())) {
      throw new AppError('DUPLICATE');
    }
    const row: Governorate = { id: uid('gov'), name_ar: input.name_ar.trim(), sort_order: input.sort_order };
    this.db.governorates.push(row);
    return row;
  }

  async updateGovernorate(id: string, input: { name_ar: string; sort_order: number }): Promise<Governorate> {
    this.requirePerm('reference:write');
    const idx = this.db.governorates.findIndex((g) => g.id === id);
    if (idx === -1) throw new AppError('UNKNOWN');
    if (this.db.governorates.some((g) => g.id !== id && g.name_ar === input.name_ar.trim())) {
      throw new AppError('DUPLICATE');
    }
    const updated: Governorate = { id, name_ar: input.name_ar.trim(), sort_order: input.sort_order };
    this.db.governorates[idx] = updated;
    return updated;
  }

  async deleteGovernorate(id: string): Promise<void> {
    this.requirePerm('reference:write');
    const admCount = this.db.administrations.filter((a) => a.governorate_id === id).length;
    const stuCount = this.db.students.filter((s) => s.governorate_id === id).length;
    if (admCount > 0 || stuCount > 0) {
      const deps = [];
      if (admCount > 0) deps.push({ label: 'إدارة تعليمية', count: admCount });
      if (stuCount > 0) deps.push({ label: 'طالب', count: stuCount });
      throw new AppError('FK_BLOCKED', undefined, { blockingDependencies: deps });
    }
    this.db.governorates = this.db.governorates.filter((g) => g.id !== id);
  }

  async getAdministrations(governorateId?: string): Promise<Administration[]> {
    this.requirePerm('reference:read');
    return this.db.administrations.filter((a) => !governorateId || a.governorate_id === governorateId);
  }

  async createAdministration(input: {
    governorate_id: string;
    name_ar: string;
    is_active: boolean;
  }): Promise<Administration> {
    this.requirePerm('reference:write');
    if (
      this.db.administrations.some(
        (a) => a.governorate_id === input.governorate_id && a.name_ar === input.name_ar.trim()
      )
    ) {
      throw new AppError('DUPLICATE');
    }
    const row: Administration = {
      id: uid('adm'),
      governorate_id: input.governorate_id,
      name_ar: input.name_ar.trim(),
      is_active: input.is_active,
    };
    this.db.administrations.push(row);
    return row;
  }

  async updateAdministration(id: string, input: { name_ar: string; is_active: boolean }): Promise<Administration> {
    this.requirePerm('reference:write');
    const existing = this.db.administrations.find((a) => a.id === id);
    if (!existing) throw new AppError('UNKNOWN');
    if (
      this.db.administrations.some(
        (a) =>
          a.id !== id &&
          a.governorate_id === existing.governorate_id &&
          a.name_ar === input.name_ar.trim()
      )
    ) {
      throw new AppError('DUPLICATE');
    }
    existing.name_ar = input.name_ar.trim();
    existing.is_active = input.is_active;
    return { ...existing };
  }

  async deleteAdministration(id: string): Promise<void> {
    this.requirePerm('reference:write');
    const stuCount = this.db.students.filter((s) => s.administration_id === id).length;
    if (stuCount > 0) {
      throw new AppError('FK_BLOCKED', undefined, {
        blockingDependencies: [{ label: 'طالب', count: stuCount }],
      });
    }
    this.db.administrations = this.db.administrations.filter((a) => a.id !== id);
  }

  async bulkImportAdministrations(
    rows: Array<{ governorate: string; administration: string }>
  ): Promise<{ inserted: number; skippedDuplicates: number; unknownGovernorates: string[] }> {
    this.requirePerm('reference:write');
    let inserted = 0;
    let skippedDuplicates = 0;
    const unknownSet = new Set<string>();

    for (const r of rows) {
      const gov = this.db.governorates.find((g) => g.name_ar === r.governorate.trim());
      if (!gov) {
        unknownSet.add(r.governorate);
        continue;
      }
      const exists = this.db.administrations.some(
        (a) => a.governorate_id === gov.id && a.name_ar === r.administration.trim()
      );
      if (exists) {
        skippedDuplicates++;
        continue;
      }
      this.db.administrations.push({
        id: uid('adm'),
        governorate_id: gov.id,
        name_ar: r.administration.trim(),
        is_active: true,
      });
      inserted++;
    }
    return { inserted, skippedDuplicates, unknownGovernorates: Array.from(unknownSet) };
  }

  async getStages(): Promise<Stage[]> {
    this.requirePerm('reference:read');
    return [...this.db.stages].sort((a, b) => a.sort_order - b.sort_order);
  }

  async createStage(input: { name_ar: string; sort_order: number }): Promise<Stage> {
    this.requirePerm('reference:write');
    if (this.db.stages.some((s) => s.name_ar === input.name_ar.trim())) {
      throw new AppError('DUPLICATE');
    }
    const row: Stage = { id: uid('stage'), name_ar: input.name_ar.trim(), sort_order: input.sort_order };
    this.db.stages.push(row);
    return row;
  }

  async updateStage(id: string, input: { name_ar: string; sort_order: number }): Promise<Stage> {
    this.requirePerm('reference:write');
    const existing = this.db.stages.find((s) => s.id === id);
    if (!existing) throw new AppError('UNKNOWN');
    if (this.db.stages.some((s) => s.id !== id && s.name_ar === input.name_ar.trim())) {
      throw new AppError('DUPLICATE');
    }
    existing.name_ar = input.name_ar.trim();
    existing.sort_order = input.sort_order;
    return { ...existing };
  }

  async reorderStages(items: Array<{ id: string; name_ar: string; sort_order: number }>): Promise<void> {
    this.requirePerm('reference:write');
    for (const item of items) {
      const target = this.db.stages.find((s) => s.id === item.id);
      if (target) target.sort_order = item.sort_order;
    }
  }

  async checkStageDependencies(id: string): Promise<DependencyCheckResult> {
    this.requirePerm('reference:read');
    const tracksCount = this.db.tracks.filter((t) => t.stage_id === id).length;
    const deps = tracksCount > 0 ? [{ label: 'مسار/شعبة', count: tracksCount }] : [];
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteStage(id: string): Promise<void> {
    this.requirePerm('reference:write');
    const check = await this.checkStageDependencies(id);
    if (!check.canDelete) {
      throw new AppError('FK_BLOCKED', undefined, { blockingDependencies: check.dependencies });
    }
    this.db.stages = this.db.stages.filter((s) => s.id !== id);
  }

  async getTracks(stageId?: string): Promise<Track[]> {
    this.requirePerm('reference:read');
    return this.db.tracks
      .filter((t) => !stageId || t.stage_id === stageId)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  async createTrack(input: {
    stage_id: string;
    name_ar: string;
    is_active: boolean;
    sort_order: number;
  }): Promise<Track> {
    this.requirePerm('reference:write');
    if (
      this.db.tracks.some(
        (t) => t.stage_id === input.stage_id && t.name_ar === input.name_ar.trim()
      )
    ) {
      throw new AppError('DUPLICATE');
    }
    const row: Track = {
      id: uid('track'),
      stage_id: input.stage_id,
      name_ar: input.name_ar.trim(),
      is_active: input.is_active,
      sort_order: input.sort_order,
    };
    this.db.tracks.push(row);
    return row;
  }

  async updateTrack(
    id: string,
    input: { stage_id: string; name_ar: string; is_active: boolean; sort_order: number }
  ): Promise<Track> {
    this.requirePerm('reference:write');
    const existing = this.db.tracks.find((t) => t.id === id);
    if (!existing) throw new AppError('UNKNOWN');
    if (
      this.db.tracks.some(
        (t) => t.id !== id && t.stage_id === input.stage_id && t.name_ar === input.name_ar.trim()
      )
    ) {
      throw new AppError('DUPLICATE');
    }
    existing.stage_id = input.stage_id;
    existing.name_ar = input.name_ar.trim();
    existing.is_active = input.is_active;
    existing.sort_order = input.sort_order;
    return { ...existing };
  }

  async checkTrackDependencies(id: string): Promise<DependencyCheckResult> {
    this.requirePerm('reference:read');
    const deps: Array<{ label: string; count: number }> = [];
    const stuCount = this.db.students.filter((s) => s.track_id === id).length;
    const planCount = this.db.plans.filter((p) => p.track_id === id).length;
    const subCount = this.db.subscriptions.filter((s) => s.track_id === id).length;
    const payCount = this.db.paymentRequests.filter((p) => p.track_id === id).length;
    if (stuCount > 0) deps.push({ label: 'طالب', count: stuCount });
    if (planCount > 0) deps.push({ label: 'خطة تسعير', count: planCount });
    if (subCount > 0) deps.push({ label: 'اشتراك', count: subCount });
    if (payCount > 0) deps.push({ label: 'طلب دفع', count: payCount });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteTrack(id: string): Promise<void> {
    this.requirePerm('reference:write');
    const check = await this.checkTrackDependencies(id);
    if (!check.canDelete) {
      throw new AppError('FK_BLOCKED', undefined, { blockingDependencies: check.dependencies });
    }
    this.db.trackCourses = this.db.trackCourses.filter((tc) => tc.track_id !== id);
    this.db.tracks = this.db.tracks.filter((t) => t.id !== id);
  }

  async getCourses(): Promise<Course[]> {
    this.requirePerm('reference:read');
    return [...this.db.courses].sort((a, b) => a.sort_order - b.sort_order);
  }

  async createCourse(input: {
    name_ar: string;
    icon_key: CourseIconKey;
    sort_order: number;
    is_active: boolean;
  }): Promise<Course> {
    this.requirePerm('reference:write');
    // Globally unique name_ar
    if (this.db.courses.some((c) => c.name_ar === input.name_ar.trim())) {
      throw new AppError('DUPLICATE');
    }
    const row: Course = {
      id: uid('course'),
      name_ar: input.name_ar.trim(),
      icon_key: input.icon_key,
      sort_order: input.sort_order,
      is_active: input.is_active,
    };
    this.db.courses.push(row);
    return row;
  }

  async updateCourse(
    id: string,
    input: { name_ar: string; icon_key: CourseIconKey; sort_order: number; is_active: boolean }
  ): Promise<Course> {
    this.requirePerm('reference:write');
    const existing = this.db.courses.find((c) => c.id === id);
    if (!existing) throw new AppError('UNKNOWN');
    if (this.db.courses.some((c) => c.id !== id && c.name_ar === input.name_ar.trim())) {
      throw new AppError('DUPLICATE');
    }
    existing.name_ar = input.name_ar.trim();
    existing.icon_key = input.icon_key;
    existing.sort_order = input.sort_order;
    existing.is_active = input.is_active;
    return { ...existing };
  }

  async checkCourseDependencies(id: string): Promise<DependencyCheckResult> {
    this.requirePerm('reference:read');
    const deps: Array<{ label: string; count: number }> = [];
    const lessonCount = this.db.lessons.filter((l) => l.course_id === id).length;
    const examCount = this.db.exams.filter((e) => e.course_id === id).length;
    if (lessonCount > 0) deps.push({ label: 'درس', count: lessonCount });
    if (examCount > 0) deps.push({ label: 'امتحان', count: examCount });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteCourse(id: string): Promise<void> {
    this.requirePerm('reference:write');
    const check = await this.checkCourseDependencies(id);
    if (!check.canDelete) {
      throw new AppError('FK_BLOCKED', undefined, { blockingDependencies: check.dependencies });
    }
    this.db.trackCourses = this.db.trackCourses.filter((tc) => tc.course_id !== id);
    this.db.courses = this.db.courses.filter((c) => c.id !== id);
  }

  async getTrackCourses(): Promise<TrackCourse[]> {
    this.requirePerm('reference:read');
    return [...this.db.trackCourses];
  }

  async linkTrackCourse(input: {
    track_id: string;
    course_id: string;
    sort_order: number;
  }): Promise<TrackCourse> {
    this.requirePerm('reference:write');
    if (
      this.db.trackCourses.some(
        (tc) => tc.track_id === input.track_id && tc.course_id === input.course_id
      )
    ) {
      throw new AppError('DUPLICATE');
    }
    const row: TrackCourse = { ...input };
    this.db.trackCourses.push(row);
    return row;
  }

  async unlinkTrackCourse(trackId: string, courseId: string): Promise<void> {
    this.requirePerm('reference:write');
    this.db.trackCourses = this.db.trackCourses.filter(
      (tc) => !(tc.track_id === trackId && tc.course_id === courseId)
    );
  }

  async getTerms(): Promise<Term[]> {
    this.requirePerm('reference:read');
    return [...this.db.terms].sort((a, b) => a.sort_order - b.sort_order);
  }

  async createTerm(input: {
    name_ar: string;
    sort_order: number;
    access_ends_at: string | null;
  }): Promise<Term> {
    this.requirePerm('reference:write');
    if (this.db.terms.some((t) => t.name_ar === input.name_ar.trim())) {
      throw new AppError('DUPLICATE');
    }
    const row: Term = {
      id: uid('term'),
      name_ar: input.name_ar.trim(),
      sort_order: input.sort_order,
      access_ends_at: input.access_ends_at,
    };
    this.db.terms.push(row);
    return row;
  }

  async updateTerm(
    id: string,
    input: { name_ar: string; sort_order: number; access_ends_at: string | null }
  ): Promise<Term> {
    this.requirePerm('reference:write');
    const existing = this.db.terms.find((t) => t.id === id);
    if (!existing) throw new AppError('UNKNOWN');
    if (this.db.terms.some((t) => t.id !== id && t.name_ar === input.name_ar.trim())) {
      throw new AppError('DUPLICATE');
    }
    existing.name_ar = input.name_ar.trim();
    existing.sort_order = input.sort_order;
    existing.access_ends_at = input.access_ends_at;
    return { ...existing };
  }

  async checkTermDependencies(id: string): Promise<DependencyCheckResult> {
    this.requirePerm('reference:read');
    const deps: Array<{ label: string; count: number }> = [];
    const lCount = this.db.lessons.filter((l) => l.term_id === id).length;
    const eCount = this.db.exams.filter((e) => e.term_id === id).length;
    const pCount = this.db.plans.filter((p) => p.term_id === id).length;
    const sCount = this.db.subscriptions.filter((s) => s.term_id === id).length;
    if (lCount > 0) deps.push({ label: 'درس', count: lCount });
    if (eCount > 0) deps.push({ label: 'امتحان', count: eCount });
    if (pCount > 0) deps.push({ label: 'خطة تسعير', count: pCount });
    if (sCount > 0) deps.push({ label: 'اشتراك', count: sCount });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteTerm(id: string): Promise<void> {
    this.requirePerm('reference:write');
    const check = await this.checkTermDependencies(id);
    if (!check.canDelete) {
      throw new AppError('FK_BLOCKED', undefined, { blockingDependencies: check.dependencies });
    }
    this.db.terms = this.db.terms.filter((t) => t.id !== id);
  }

  async getAllowedLinkDomains(): Promise<AllowedLinkDomain[]> {
    this.requirePerm('reference:read');
    return [...this.db.allowedDomains];
  }

  async createAllowedLinkDomain(input: {
    domain: string;
    kind: LinkKind;
    is_active: boolean;
  }): Promise<AllowedLinkDomain> {
    this.requirePerm('domains:write');
    const clean = normalizeDomainString(input.domain);
    if (this.db.allowedDomains.some((d) => normalizeDomainString(d.domain) === clean)) {
      throw new AppError('DUPLICATE');
    }
    const row: AllowedLinkDomain = {
      id: uid('dom'),
      domain: clean,
      kind: input.kind,
      is_active: input.is_active,
    };
    this.db.allowedDomains.push(row);
    return row;
  }

  async updateAllowedLinkDomain(
    id: string,
    input: { domain: string; kind: LinkKind; is_active: boolean }
  ): Promise<AllowedLinkDomain> {
    this.requirePerm('domains:write');
    const existing = this.db.allowedDomains.find((d) => d.id === id);
    if (!existing) throw new AppError('UNKNOWN');
    const clean = normalizeDomainString(input.domain);
    if (this.db.allowedDomains.some((d) => d.id !== id && normalizeDomainString(d.domain) === clean)) {
      throw new AppError('DUPLICATE');
    }
    existing.domain = clean;
    existing.kind = input.kind;
    existing.is_active = input.is_active;
    return { ...existing };
  }

  async deleteAllowedLinkDomain(id: string): Promise<void> {
    this.requirePerm('domains:write');
    this.db.allowedDomains = this.db.allowedDomains.filter((d) => d.id !== id);
  }

  // ---- Content Management ----
  async getLessons(filter: LessonsFilter): Promise<PaginatedResult<LessonWithContext>> {
    this.requirePerm('content:read');
    let list = this.db.lessons.map((l) => this.buildLessonWithContext(l));

    if (filter.courseId) list = list.filter((l) => l.course_id === filter.courseId);
    if (filter.termId) list = list.filter((l) => l.term_id === filter.termId);
    if (filter.trackId) {
      list = list.filter((l) => l.tracks.some((t) => t.track_id === filter.trackId));
    }
    if (filter.stageId) {
      list = list.filter((l) => l.tracks.some((t) => t.stage_id === filter.stageId));
    }
    if (filter.status && filter.status !== 'all') {
      list = list.filter((l) => l.status === filter.status);
    }
    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.summary ?? '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => a.sort_order - b.sort_order);
    return paginate(list, filter.page ?? 1, filter.pageSize ?? 50);
  }

  async getLessonDetail(lessonId: string): Promise<LessonDetailData> {
    this.requirePerm('content:read');
    const lesson = this.db.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new AppError('UNKNOWN', 'الدرس غير موجود.');
    const course = this.db.courses.find((c) => c.id === lesson.course_id);
    const term = this.db.terms.find((t) => t.id === lesson.term_id);
    if (!course || !term) throw new AppError('UNKNOWN');

    const tracks = this.db.trackCourses
      .filter((tc) => tc.course_id === course.id)
      .map((tc) => {
        const track = this.db.tracks.find((t) => t.id === tc.track_id);
        const stage = track ? this.db.stages.find((s) => s.id === track.stage_id) : undefined;
        return track && stage ? { track, stage } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const items = this.db.lessonItems
      .filter((i) => i.lesson_id === lessonId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        ...i,
        quick_questions: i.quick_questions
          ? [...i.quick_questions]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((q) => ({
                ...q,
                options: [...q.options].sort((a, b) => a.sort_order - b.sort_order),
              }))
          : undefined,
      }));

    return { lesson: { ...lesson }, course, term, tracks, items };
  }

  async createLesson(input: {
    course_id: string;
    term_id: string;
    title: string;
    summary: string | null;
  }): Promise<Lesson> {
    this.requirePerm('content:write');
    const existingOrders = this.db.lessons
      .filter((l) => l.course_id === input.course_id && l.term_id === input.term_id)
      .map((l) => l.sort_order);
    const nextOrder = (existingOrders.length > 0 ? Math.max(...existingOrders) : 0) + 1;
    const now = new Date().toISOString();
    const row: Lesson = {
      id: uid('lesson'),
      course_id: input.course_id,
      term_id: input.term_id,
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      sort_order: nextOrder,
      status: 'draft',
      published_at: null,
      created_at: now,
      updated_at: now,
    };
    this.db.lessons.push(row);
    return { ...row };
  }

  async updateLessonMeta(
    lessonId: string,
    input: { title: string; summary: string | null }
  ): Promise<Lesson> {
    this.requirePerm('content:write');
    const lesson = this.db.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new AppError('UNKNOWN');
    lesson.title = input.title.trim();
    lesson.summary = input.summary?.trim() || null;
    lesson.updated_at = new Date().toISOString();
    return { ...lesson };
  }

  async setLessonStatus(lessonId: string, status: LessonStatus): Promise<Lesson> {
    this.requirePerm('content:write');
    const lesson = this.db.lessons.find((l) => l.id === lessonId);
    if (!lesson) throw new AppError('UNKNOWN');

    if (status === 'published') {
      const items = this.db.lessonItems.filter((i) => i.lesson_id === lessonId);
      const check = checkLessonPublishable(items);
      if (!check.canPublish) {
        const failed = check.checks.find((c) => !c.passed);
        throw new AppError((failed?.errorCode as 'LESSON_HAS_NO_ITEMS') ?? 'LESSON_HAS_NO_ITEMS');
      }
      lesson.published_at = lesson.published_at ?? new Date().toISOString();
    }

    lesson.status = status;
    lesson.updated_at = new Date().toISOString();
    return { ...lesson };
  }

  async reorderLessons(
    rows: Array<{ id: string; course_id: string; term_id: string; title: string; sort_order: number }>
  ): Promise<void> {
    this.requirePerm('content:write');
    const orders = new Set(rows.map((r) => r.sort_order));
    if (orders.size !== rows.length) {
      throw new AppError('REORDER_FAILED');
    }
    for (const r of rows) {
      const target = this.db.lessons.find((l) => l.id === r.id);
      if (target) {
        target.sort_order = r.sort_order;
        target.updated_at = new Date().toISOString();
      }
    }
  }

  async getLessonDeleteImpact(lessonId: string): Promise<{ progressCount: number; answersCount: number }> {
    this.requirePerm('content:read');
    const itemIds = new Set(
      this.db.lessonItems.filter((i) => i.lesson_id === lessonId).map((i) => i.id)
    );
    return {
      progressCount: this.db.itemProgress.filter((p) => itemIds.has(p.item_id)).length,
      answersCount: this.db.quickAnswers.filter((a) => itemIds.has(a.item_id)).length,
    };
  }

  async deleteLesson(lessonId: string): Promise<void> {
    this.requirePerm('content:write');
    const itemIds = new Set(
      this.db.lessonItems.filter((i) => i.lesson_id === lessonId).map((i) => i.id)
    );
    this.db.itemProgress = this.db.itemProgress.filter((p) => !itemIds.has(p.item_id));
    this.db.quickAnswers = this.db.quickAnswers.filter((a) => !itemIds.has(a.item_id));
    this.db.lessonItems = this.db.lessonItems.filter((i) => i.lesson_id !== lessonId);
    this.db.lessons = this.db.lessons.filter((l) => l.id !== lessonId);
  }

  async createLessonItem(input: {
    lesson_id: string;
    item_type: LessonItemType;
    title: string;
    body_json?: Record<string, unknown> | null;
    body_html?: string | null;
    url?: string | null;
  }): Promise<LessonItem> {
    this.requirePerm('content:write');
    const existingOrders = this.db.lessonItems
      .filter((i) => i.lesson_id === input.lesson_id)
      .map((i) => i.sort_order);
    const nextOrder = (existingOrders.length > 0 ? Math.max(...existingOrders) : 0) + 1;

    let link_kind: LinkKind | null = null;
    let android_only = false;
    let cleanHtml: string | null = null;

    if (input.item_type === 'link') {
      const check = checkLinkAgainstAllowedDomains(input.url ?? '', this.db.allowedDomains);
      if (check.errorCode) throw new AppError(check.errorCode);
      link_kind = check.inferredKind;
      android_only = check.androidOnly;
    } else if (input.item_type === 'article') {
      cleanHtml = sanitizeArticleHtml(input.body_html ?? '<p></p>');
    }

    const row: LessonItem = {
      id: uid('item'),
      lesson_id: input.lesson_id,
      item_type: input.item_type,
      title: input.title.trim(),
      sort_order: nextOrder,
      body_json: input.item_type === 'article' ? (input.body_json ?? { type: 'doc', content: [] }) : null,
      body_html: input.item_type === 'article' ? cleanHtml : null,
      url: input.item_type === 'link' ? (input.url?.trim() ?? null) : null,
      link_kind,
      android_only,
      quick_questions: input.item_type === 'quick_questions' ? [] : undefined,
    };

    this.db.lessonItems.push(row);
    const lesson = this.db.lessons.find((l) => l.id === input.lesson_id);
    if (lesson) lesson.updated_at = new Date().toISOString();
    return { ...row };
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
    this.requirePerm('content:write');
    const item = this.db.lessonItems.find((i) => i.id === itemId);
    if (!item) throw new AppError('UNKNOWN');

    item.title = input.title.trim();
    if (item.item_type === 'article') {
      item.body_json = input.body_json ?? item.body_json;
      item.body_html = sanitizeArticleHtml(input.body_html ?? '');
      item.url = null;
    } else if (item.item_type === 'link') {
      const check = checkLinkAgainstAllowedDomains(input.url ?? '', this.db.allowedDomains);
      if (check.errorCode) throw new AppError(check.errorCode);
      item.url = input.url?.trim() ?? null;
      item.link_kind = check.inferredKind;
      item.android_only = check.androidOnly;
    }
    const lesson = this.db.lessons.find((l) => l.id === item.lesson_id);
    if (lesson) lesson.updated_at = new Date().toISOString();
    return { ...item };
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
    this.requirePerm('content:write');
    const orders = new Set(rows.map((r) => r.sort_order));
    if (orders.size !== rows.length) throw new AppError('REORDER_FAILED');
    for (const r of rows) {
      const item = this.db.lessonItems.find((i) => i.id === r.id);
      if (item) item.sort_order = r.sort_order;
    }
  }

  async getLessonItemDeleteImpact(itemId: string): Promise<{ progressCount: number; answersCount: number }> {
    this.requirePerm('content:read');
    return {
      progressCount: this.db.itemProgress.filter((p) => p.item_id === itemId).length,
      answersCount: this.db.quickAnswers.filter((a) => a.item_id === itemId).length,
    };
  }

  async deleteLessonItem(itemId: string): Promise<void> {
    this.requirePerm('content:write');
    this.db.itemProgress = this.db.itemProgress.filter((p) => p.item_id !== itemId);
    this.db.quickAnswers = this.db.quickAnswers.filter((a) => a.item_id !== itemId);
    this.db.lessonItems = this.db.lessonItems.filter((i) => i.id !== itemId);
  }

  async upsertQuickQuestion(input: {
    id?: string;
    item_id: string;
    prompt: string;
    explanation: string | null;
    options: Array<{ id?: string; option_text: string; is_correct: boolean; sort_order: number }>;
  }): Promise<void> {
    this.requirePerm('content:write');
    const item = this.db.lessonItems.find((i) => i.id === input.item_id);
    if (!item) throw new AppError('UNKNOWN');
    if (item.item_type !== 'quick_questions') throw new AppError('ITEM_IS_NOT_QUICK_QUESTIONS');

    const correctCount = input.options.filter((o) => o.is_correct).length;
    if (correctCount > 1) {
      throw new AppError('QUICK_QUESTION_INVALID', 'لا يمكن تحديد أكثر من إجابة صحيحة واحدة.');
    }

    const qList = item.quick_questions ?? [];
    const qId = input.id ?? uid('qq');
    const nextOrder =
      qList.find((q) => q.id === qId)?.sort_order ??
      (qList.length > 0 ? Math.max(...qList.map((q) => q.sort_order)) + 1 : 1);

    const formatted = {
      id: qId,
      item_id: item.id,
      prompt: input.prompt.trim(),
      explanation: input.explanation?.trim() || null,
      sort_order: nextOrder,
      options: input.options.map((o, i) => ({
        id: o.id ?? uid('qqo'),
        question_id: qId,
        option_text: o.option_text.trim(),
        is_correct: o.is_correct,
        sort_order: i + 1,
      })),
    };

    const existingIdx = qList.findIndex((q) => q.id === qId);
    if (existingIdx >= 0) {
      qList[existingIdx] = formatted;
    } else {
      qList.push(formatted);
    }
    item.quick_questions = qList;
  }

  async deleteQuickQuestion(questionId: string): Promise<void> {
    this.requirePerm('content:write');
    for (const item of this.db.lessonItems) {
      if (item.quick_questions) {
        item.quick_questions = item.quick_questions.filter((q) => q.id !== questionId);
      }
    }
  }

  async reorderQuickQuestions(
    rows: Array<{ id: string; item_id: string; prompt: string; sort_order: number }>
  ): Promise<void> {
    this.requirePerm('content:write');
    for (const r of rows) {
      const item = this.db.lessonItems.find((i) => i.id === r.item_id);
      const q = item?.quick_questions?.find((qq) => qq.id === r.id);
      if (q) q.sort_order = r.sort_order;
    }
  }

  async uploadContentMedia(file: File): Promise<{ publicUrl: string; path: string }> {
    this.requirePerm('media:upload');
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      throw new AppError('FILE_TYPE_NOT_ALLOWED');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new AppError('FILE_TOO_LARGE');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new AppError('UNKNOWN'));
      reader.readAsDataURL(file);
    });
    const path = `article/${uid('img')}/${file.name}`;
    this.db.mediaFiles[path] = dataUrl;
    return { publicUrl: dataUrl, path };
  }

  async deleteContentMedia(path: string): Promise<void> {
    this.requirePerm('media:upload');
    delete this.db.mediaFiles[path];
  }

  // ---- Pricing & Subscriptions ----
  async getPlans(): Promise<Plan[]> {
    this.requirePerm('reference:read');
    return [...this.db.plans];
  }

  async createPlan(input: {
    track_id: string;
    term_id: string;
    price_egp: number;
    is_active: boolean;
  }): Promise<Plan> {
    this.requirePerm('plans:write');
    if (input.price_egp <= 0) throw new AppError('CHECK_FAILED');
    if (
      input.is_active &&
      this.db.plans.some(
        (p) => p.track_id === input.track_id && p.term_id === input.term_id && p.is_active
      )
    ) {
      throw new AppError('DUPLICATE', 'توجد خطة مفعّلة بالفعل لهذا المسار والترم.');
    }
    const row: Plan = {
      id: uid('plan'),
      track_id: input.track_id,
      term_id: input.term_id,
      price_egp: input.price_egp,
      is_active: input.is_active,
      created_at: new Date().toISOString(),
    };
    this.db.plans.push(row);
    return row;
  }

  async updatePlan(id: string, input: { price_egp: number; is_active: boolean }): Promise<Plan> {
    this.requirePerm('plans:write');
    if (input.price_egp <= 0) throw new AppError('CHECK_FAILED');
    const existing = this.db.plans.find((p) => p.id === id);
    if (!existing) throw new AppError('UNKNOWN');
    if (
      input.is_active &&
      this.db.plans.some(
        (p) =>
          p.id !== id &&
          p.track_id === existing.track_id &&
          p.term_id === existing.term_id &&
          p.is_active
      )
    ) {
      throw new AppError('DUPLICATE', 'توجد خطة مفعّلة بالفعل لهذا المسار والترم.');
    }
    existing.price_egp = input.price_egp;
    existing.is_active = input.is_active;
    return { ...existing };
  }

  async deletePlan(id: string): Promise<void> {
    this.requirePerm('plans:write');
    const plan = this.db.plans.find((p) => p.id === id);
    if (!plan) return;
    const usedInPayments = this.db.paymentRequests.some(
      (r) => r.track_id === plan.track_id && r.term_id === plan.term_id
    );
    const usedInSubs = this.db.subscriptions.some(
      (s) => s.track_id === plan.track_id && s.term_id === plan.term_id
    );
    if (usedInPayments || usedInSubs) {
      throw new AppError('FK_BLOCKED', undefined, {
        blockingDependencies: [{ label: 'اشتراكات أو طلبات دفع', count: 1 }],
      });
    }
    this.db.plans = this.db.plans.filter((p) => p.id !== id);
  }

  async getSubscriptions(filter: SubscriptionsFilter): Promise<PaginatedResult<Subscription>> {
    this.requirePerm('subscriptions:read');
    let list = this.db.subscriptions.map((s) => this.buildSubscriptionRow(s));

    if (filter.status && filter.status !== 'all') {
      list = list.filter((s) => s.status === filter.status);
    }
    if (filter.termId) list = list.filter((s) => s.term_id === filter.termId);
    if (filter.trackId) list = list.filter((s) => s.track_id === filter.trackId);
    if (filter.stageId) list = list.filter((s) => s.stage_id === filter.stageId);
    if (filter.fromDate) {
      const from = new Date(filter.fromDate).getTime();
      list = list.filter((s) => new Date(s.starts_at).getTime() >= from);
    }
    if (filter.toDate) {
      const to = new Date(filter.toDate).getTime();
      list = list.filter((s) => new Date(s.starts_at).getTime() <= to);
    }
    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          (s.student_name ?? '').toLowerCase().includes(q) ||
          (s.student_phone ?? '').includes(q)
      );
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return paginate(list, filter.page ?? 1, filter.pageSize ?? 25);
  }

  async grantSubscription(input: {
    student_id: string;
    term_id: string;
    ends_at: string;
    note?: string;
  }): Promise<Subscription> {
    const actor = this.requirePerm('subscriptions:grant');
    const stu = this.db.students.find((s) => s.id === input.student_id);
    if (!stu) throw new AppError('STUDENT_NOT_FOUND');

    const endsMs = new Date(input.ends_at).getTime();
    if (Number.isNaN(endsMs) || endsMs <= Date.now()) {
      throw new AppError('CHECK_FAILED', 'تاريخ الانتهاء يجب أن يكون في المستقبل.');
    }

    const overlap = this.db.subscriptions.some(
      (sub) =>
        sub.student_id === stu.id &&
        sub.term_id === input.term_id &&
        sub.status === 'active' &&
        new Date(sub.ends_at).getTime() > Date.now()
    );
    if (overlap) throw new AppError('ALREADY_SUBSCRIBED');

    const now = new Date().toISOString();
    const sub: Subscription = {
      id: uid('sub'),
      student_id: stu.id,
      track_id: stu.track_id,
      term_id: input.term_id,
      price_paid_egp: 0,
      starts_at: now,
      ends_at: new Date(input.ends_at).toISOString(),
      status: 'active',
      payment_request_id: null,
      granted_by: actor.userId,
      grant_note: input.note?.trim() || 'منح يدوي من الإدارة',
      created_at: now,
    };
    this.db.subscriptions.unshift(sub);
    this.writeAudit(actor, 'grant_subscription', 'subscription', sub.id, {
      student_id: stu.id,
      term_id: input.term_id,
    });
    return this.buildSubscriptionRow(sub);
  }

  // ---- Payments ----
  async getPaymentQueue(filter: PaymentQueueFilter): Promise<PaginatedResult<PaymentQueueRow>> {
    this.requirePerm('payments:read');
    let list = this.db.paymentRequests
      .filter((p) => p.status === filter.status)
      .map((p) => this.buildPaymentRow(p));

    if (filter.termId) list = list.filter((p) => p.term_id === filter.termId);
    if (filter.trackId) list = list.filter((p) => p.track_id === filter.trackId);
    if (filter.fromDate) {
      const from = new Date(filter.fromDate).getTime();
      list = list.filter((p) => new Date(p.created_at).getTime() >= from);
    }
    if (filter.toDate) {
      const to = new Date(filter.toDate).getTime();
      list = list.filter((p) => new Date(p.created_at).getTime() <= to);
    }
    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.student_name.toLowerCase().includes(q) ||
          p.student_phone.includes(q) ||
          p.sender_phone.includes(q)
      );
    }

    // Oldest first for pending, newest first for approved/rejected
    if (filter.status === 'pending') {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      list.sort((a, b) => new Date(b.reviewed_at ?? b.created_at).getTime() - new Date(a.reviewed_at ?? a.created_at).getTime());
    }

    return paginate(list, filter.page ?? 1, filter.pageSize ?? 25);
  }

  async getPaymentProofSignedUrl(proofPath: string): Promise<string> {
    this.requirePerm('payments:read');
    // Generate crisp inline SVG data URL simulating a signed receipt image
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="360" viewBox="0 0 520 360">
      <rect width="520" height="360" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" rx="12"/>
      <rect x="24" y="24" width="472" height="56" fill="#187750" rx="8"/>
      <text x="260" y="58" font-family="sans-serif" font-size="18" fill="#ffffff" text-anchor="middle" font-weight="bold">إيصال تحويل بنكي / محفظة إلكترونية</text>
      <text x="460" y="120" font-family="sans-serif" font-size="15" fill="#0f172a" text-anchor="end">رقم المرجع: ${proofPath}</text>
      <text x="460" y="155" font-family="sans-serif" font-size="15" fill="#0f172a" text-anchor="end">الحالة: عملية تحويل ناجحة</text>
      <text x="460" y="190" font-family="sans-serif" font-size="15" fill="#0f172a" text-anchor="end">المبلغ المحول: 300.00 ج.م</text>
      <rect x="40" y="230" width="440" height="90" fill="#ecfdf5" stroke="#a7f3d0" rx="8"/>
      <text x="260" y="280" font-family="sans-serif" font-size="14" fill="#065f46" text-anchor="middle">صورة مؤقتة عبر رابط موقّع (Signed URL)</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async approvePayment(requestId: string, endsAtOverride?: string | null): Promise<Subscription> {
    const actor = this.requirePerm('payments:review');
    const req = this.db.paymentRequests.find((r) => r.id === requestId);
    if (!req) throw new AppError('REQUEST_NOT_FOUND');
    if (req.status !== 'pending') throw new AppError('REQUEST_ALREADY_REVIEWED');

    const term = this.db.terms.find((t) => t.id === req.term_id);
    const endsAt = endsAtOverride?.trim() || term?.access_ends_at || null;
    if (!endsAt) throw new AppError('TERM_ACCESS_END_NOT_SET');

    const overlap = this.db.subscriptions.some(
      (s) =>
        s.student_id === req.student_id &&
        s.term_id === req.term_id &&
        s.status === 'active' &&
        new Date(s.ends_at).getTime() > Date.now()
    );
    if (overlap) throw new AppError('ALREADY_SUBSCRIBED');

    const now = new Date().toISOString();
    req.status = 'approved';
    req.reviewed_by = actor.userId;
    req.reviewed_at = now;

    const sub: Subscription = {
      id: uid('sub'),
      student_id: req.student_id,
      track_id: req.track_id,
      term_id: req.term_id,
      price_paid_egp: req.amount_egp,
      starts_at: now,
      ends_at: new Date(endsAt).toISOString(),
      status: 'active',
      payment_request_id: req.id,
      granted_by: null,
      grant_note: null,
      created_at: now,
    };
    this.db.subscriptions.unshift(sub);
    this.writeAudit(actor, 'approve_payment', 'payment_request', req.id, {
      student_id: req.student_id,
      amount_egp: req.amount_egp,
      subscription_id: sub.id,
    });
    return this.buildSubscriptionRow(sub);
  }

  async rejectPayment(requestId: string, reason: string): Promise<void> {
    const actor = this.requirePerm('payments:review');
    if (!reason.trim()) throw new AppError('REJECT_REASON_REQUIRED');
    const req = this.db.paymentRequests.find((r) => r.id === requestId);
    if (!req) throw new AppError('REQUEST_NOT_FOUND');
    if (req.status !== 'pending') throw new AppError('REQUEST_ALREADY_REVIEWED');

    req.status = 'rejected';
    req.reject_reason = reason.trim();
    req.reviewed_by = actor.userId;
    req.reviewed_at = new Date().toISOString();
    this.writeAudit(actor, 'reject_payment', 'payment_request', req.id, {
      reason: req.reject_reason,
    });
  }

  // ---- Students ----
  async getStudents(filter: StudentsFilter): Promise<PaginatedResult<StudentOverviewRow>> {
    this.requirePerm('students:read');
    let list = this.db.students.map((s) => this.buildStudentOverview(s));

    if (filter.search?.trim()) {
      const q = filter.search.trim().toLowerCase();
      list = list.filter((s) => s.full_name.toLowerCase().includes(q) || s.phone.includes(q));
    }
    if (filter.governorateId) list = list.filter((s) => s.governorate_id === filter.governorateId);
    if (filter.administrationId)
      list = list.filter((s) => s.administration_id === filter.administrationId);
    if (filter.stageId) list = list.filter((s) => s.stage_id === filter.stageId);
    if (filter.trackId) list = list.filter((s) => s.track_id === filter.trackId);
    if (filter.status && filter.status !== 'all') {
      list = list.filter((s) => {
        if (filter.status === 'blocked') return s.is_blocked;
        if (filter.status === 'subscribed') return !s.is_blocked && s.active_subscriptions_count > 0;
        if (filter.status === 'trial')
          return !s.is_blocked && s.active_subscriptions_count === 0 && s.trial_days_left > 0;
        if (filter.status === 'expired')
          return !s.is_blocked && s.active_subscriptions_count === 0 && s.trial_days_left === 0;
        return true;
      });
    }
    if (filter.fromDate) {
      const from = new Date(filter.fromDate).getTime();
      list = list.filter((s) => new Date(s.created_at).getTime() >= from);
    }
    if (filter.toDate) {
      const to = new Date(filter.toDate).getTime();
      list = list.filter((s) => new Date(s.created_at).getTime() <= to);
    }

    const sortBy = filter.sortBy ?? 'created_at';
    const dir = filter.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === 'full_name') return a.full_name.localeCompare(b.full_name, 'ar') * dir;
      if (sortBy === 'trial_ends_at') {
        return (new Date(a.trial_ends_at).getTime() - new Date(b.trial_ends_at).getTime()) * dir;
      }
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });

    return paginate(list, filter.page ?? 1, filter.pageSize ?? 25);
  }

  async getStudentDetail(studentId: string): Promise<{
    student: StudentOverviewRow;
    subscriptions: Subscription[];
    payments: PaymentQueueRow[];
  }> {
    this.requirePerm('students:read');
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu) throw new AppError('STUDENT_NOT_FOUND');

    return {
      student: this.buildStudentOverview(stu),
      subscriptions: this.db.subscriptions
        .filter((s) => s.student_id === studentId)
        .map((s) => this.buildSubscriptionRow(s)),
      payments: this.db.paymentRequests
        .filter((p) => p.student_id === studentId)
        .map((p) => this.buildPaymentRow(p)),
    };
  }

  async getStudentActivity(studentId: string): Promise<{
    progress: StudentItemProgress[];
    quickAnswers: StudentQuickAnswer[];
  }> {
    this.requirePerm('students:manage');
    return {
      progress: this.db.itemProgress.filter((p) => p.student_id === studentId),
      quickAnswers: this.db.quickAnswers.filter((a) => a.student_id === studentId),
    };
  }

  async getStudentExams(studentId: string): Promise<{
    attempts: ExamAttempt[];
    results: ExamResultRow[];
  }> {
    this.requirePerm('students:read');
    return {
      attempts: this.db.examAttempts.filter((a) => a.student_id === studentId),
      results: this.db.examResults
        .filter((r) => r.student_id === studentId)
        .map((r) => ({
          ...r,
          exam_title: this.db.exams.find((e) => e.id === r.exam_id)?.title,
        })),
    };
  }

  async getStudentDevices(studentId: string): Promise<DeviceSession[]> {
    this.requirePerm('students:read');
    return this.db.deviceSessions.filter((d) => d.student_id === studentId);
  }

  async extendTrial(studentId: string, days: number): Promise<void> {
    const actor = this.requirePerm('students:manage');
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new AppError('INVALID_DAYS');
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu) throw new AppError('STUDENT_NOT_FOUND');
    const baseMs = Math.max(Date.now(), new Date(stu.trial_ends_at).getTime());
    stu.trial_ends_at = new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString();
    this.writeAudit(actor, 'extend_trial', 'profile', stu.id, { days });
  }

  async setStudentBlocked(studentId: string, blocked: boolean, reason?: string): Promise<void> {
    const actor = this.requirePerm('students:manage');
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu) throw new AppError('STUDENT_NOT_FOUND');
    stu.is_blocked = blocked;
    stu.block_reason = blocked ? (reason?.trim() || null) : null;
    if (blocked) {
      this.db.deviceSessions.forEach((d) => {
        if (d.student_id === studentId) d.is_active = false;
      });
    }
    this.writeAudit(actor, blocked ? 'block_student' : 'unblock_student', 'profile', stu.id, {
      reason: stu.block_reason,
    });
  }

  async changeStudentTrack(studentId: string, trackId: string): Promise<void> {
    const actor = this.requirePerm('students:track');
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu) throw new AppError('STUDENT_NOT_FOUND');
    const track = this.db.tracks.find((t) => t.id === trackId);
    if (!track || !track.is_active) throw new AppError('TRACK_NOT_ACTIVE');
    const prev = stu.track_id;
    stu.track_id = trackId;
    this.writeAudit(actor, 'change_student_track', 'profile', stu.id, {
      from_track_id: prev,
      to_track_id: trackId,
    });
  }

  async updateStudentLocation(
    studentId: string,
    governorateId: string,
    administrationId: string | null
  ): Promise<void> {
    const actor = this.requirePerm('students:location');
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu) throw new AppError('STUDENT_NOT_FOUND');
    if (administrationId) {
      const adm = this.db.administrations.find((a) => a.id === administrationId);
      if (!adm || adm.governorate_id !== governorateId) {
        throw new AppError('ADMINISTRATION_NOT_IN_GOVERNORATE');
      }
    }
    stu.governorate_id = governorateId;
    stu.administration_id = administrationId;
    this.writeAudit(actor, 'update_student_location', 'profile', stu.id, {
      governorate_id: governorateId,
      administration_id: administrationId,
    });
  }

  async resetStudentSession(studentId: string): Promise<void> {
    const actor = this.requirePerm('students:reset_session');
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu) throw new AppError('STUDENT_NOT_FOUND');
    this.db.deviceSessions.forEach((d) => {
      if (d.student_id === studentId) d.is_active = false;
    });
    this.writeAudit(actor, 'reset_student_session', 'device_sessions', stu.id, {});
  }

  // ---- Exams ----
  private isExamLocked(examId: string): boolean {
    const now = Date.now();
    return this.db.examSessions.some(
      (s) => s.exam_id === examId && new Date(s.starts_at).getTime() <= now
    );
  }

  async getExams(filter?: { courseId?: string; termId?: string; status?: string }): Promise<Exam[]> {
    this.requirePerm('exams:read');
    return this.db.exams.filter((e) => {
      if (filter?.courseId && e.course_id !== filter.courseId) return false;
      if (filter?.termId && e.term_id !== filter.termId) return false;
      if (filter?.status && filter.status !== 'all' && e.status !== filter.status) return false;
      return true;
    });
  }

  async getExamDetail(examId: string): Promise<ExamDetailData> {
    this.requirePerm('exams:read');
    const exam = this.db.exams.find((e) => e.id === examId);
    if (!exam) throw new AppError('UNKNOWN', 'الامتحان غير موجود.');
    const course = this.db.courses.find((c) => c.id === exam.course_id);
    const term = this.db.terms.find((t) => t.id === exam.term_id);
    if (!course || !term) throw new AppError('UNKNOWN');

    const tracks = this.db.trackCourses
      .filter((tc) => tc.course_id === course.id)
      .map((tc) => {
        const track = this.db.tracks.find((t) => t.id === tc.track_id);
        const stage = track ? this.db.stages.find((s) => s.id === track.stage_id) : undefined;
        return track && stage ? { track, stage } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const questions = this.db.examQuestions
      .filter((q) => q.exam_id === examId)
      .sort((a, b) => a.position - b.position);
    const sessions = this.db.examSessions
      .filter((s) => s.exam_id === examId)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const sessionIds = new Set(sessions.map((s) => s.id));
    const audiences = this.db.sessionAudiences.filter((a) => sessionIds.has(a.session_id));

    return {
      exam: { ...exam },
      course,
      term,
      tracks,
      questions,
      sessions,
      audiences,
      isLocked: this.isExamLocked(examId),
      isApproved: this.db.examResults.some((r) => r.exam_id === examId),
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
    this.requirePerm('exams:write');
    const now = new Date().toISOString();
    const exam: Exam = {
      id: uid('exam'),
      course_id: input.course_id,
      term_id: input.term_id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      duration_minutes: input.duration_minutes,
      late_entry_minutes: input.late_entry_minutes,
      disconnect_grace_seconds: input.disconnect_grace_seconds,
      status: 'draft',
      created_at: now,
      updated_at: now,
    };
    this.db.exams.unshift(exam);
    return { ...exam };
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
    this.requirePerm('exams:write');
    if (this.isExamLocked(examId)) throw new AppError('EXAM_LOCKED');
    const exam = this.db.exams.find((e) => e.id === examId);
    if (!exam) throw new AppError('UNKNOWN');
    exam.course_id = input.course_id;
    exam.term_id = input.term_id;
    exam.title = input.title.trim();
    exam.description = input.description?.trim() || null;
    exam.duration_minutes = input.duration_minutes;
    exam.late_entry_minutes = input.late_entry_minutes;
    exam.disconnect_grace_seconds = input.disconnect_grace_seconds;
    exam.updated_at = new Date().toISOString();

    // Recompute ends_at of sessions when duration changes
    this.db.examSessions
      .filter((s) => s.exam_id === examId)
      .forEach((s) => {
        s.ends_at = new Date(
          new Date(s.starts_at).getTime() + exam.duration_minutes * 60 * 1000
        ).toISOString();
      });

    return { ...exam };
  }

  async setExamStatus(examId: string, status: 'draft' | 'published' | 'archived'): Promise<Exam> {
    this.requirePerm('exams:write');
    const exam = this.db.exams.find((e) => e.id === examId);
    if (!exam) throw new AppError('UNKNOWN');

    if (status === 'published') {
      const detail = await this.getExamDetail(examId);
      const coverage = computeExamCoveragePreview({
        sessions: detail.sessions,
        audiences: detail.audiences,
        eligibleCourseTrackIds: detail.tracks.map((t) => t.track.id),
        governorates: this.db.governorates,
        tracks: this.db.tracks,
        students: this.db.students.map((s) => this.buildStudentOverview(s)),
      });
      const check = checkExamPublishable({
        courseId: exam.course_id,
        trackCourses: this.db.trackCourses,
        questions: detail.questions,
        sessions: detail.sessions,
        audiences: detail.audiences,
        hasAmbiguity: coverage.hasAmbiguity,
      });
      if (!check.canPublish) {
        const failed = check.checks.find((c) => !c.passed);
        throw new AppError((failed?.errorCode as 'EXAM_HAS_NO_QUESTIONS') ?? 'EXAM_HAS_NO_QUESTIONS');
      }
    }

    exam.status = status;
    exam.updated_at = new Date().toISOString();
    return { ...exam };
  }

  async upsertExamQuestion(input: {
    id?: string;
    exam_id: string;
    question_type: QuestionType;
    prompt_html: string;
    points: number;
    options: Array<{ option_text: string; is_correct: boolean; sort_order: number }>;
  }): Promise<ExamQuestion> {
    this.requirePerm('exams:write');
    if (this.isExamLocked(input.exam_id)) throw new AppError('EXAM_LOCKED');
    if (input.points <= 0) throw new AppError('CHECK_FAILED');

    if (input.question_type === 'essay' && input.options.length > 0) {
      throw new AppError('ESSAY_CANNOT_HAVE_OPTIONS');
    }
    if (input.question_type === 'mcq') {
      const correctCount = input.options.filter((o) => o.is_correct).length;
      if (input.options.length < 2 || input.options.length > 6 || correctCount !== 1) {
        throw new AppError('MCQ_INVALID');
      }
    }

    const qId = input.id ?? uid('eq');
    const exQuestions = this.db.examQuestions.filter((q) => q.exam_id === input.exam_id);
    const existing = exQuestions.find((q) => q.id === qId);
    const position =
      existing?.position ??
      (exQuestions.length > 0 ? Math.max(...exQuestions.map((q) => q.position)) + 1 : 1);

    const row: ExamQuestion = {
      id: qId,
      exam_id: input.exam_id,
      position,
      question_type: input.question_type,
      prompt_html: sanitizeArticleHtml(input.prompt_html),
      points: input.points,
      options:
        input.question_type === 'mcq'
          ? input.options.map((o, idx) => ({
              id: uid('eqo'),
              question_id: qId,
              option_text: o.option_text.trim(),
              is_correct: o.is_correct,
              sort_order: idx + 1,
            }))
          : [],
    };

    if (existing) {
      const idx = this.db.examQuestions.findIndex((q) => q.id === qId);
      this.db.examQuestions[idx] = row;
    } else {
      this.db.examQuestions.push(row);
    }
    return row;
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
    this.requirePerm('exams:write');
    if (this.isExamLocked(examId)) throw new AppError('EXAM_LOCKED');

    for (const q of questions) {
      await this.upsertExamQuestion({
        exam_id: examId,
        question_type: q.question_type,
        prompt_html: q.prompt_html,
        points: q.points,
        options: q.options,
      });
    }
    return questions.length;
  }

  async deleteExamQuestion(examId: string, questionId: string): Promise<void> {
    this.requirePerm('exams:write');
    if (this.isExamLocked(examId)) throw new AppError('EXAM_LOCKED');
    this.db.examQuestions = this.db.examQuestions.filter((q) => q.id !== questionId);
  }

  async reorderExamQuestions(
    examId: string,
    rows: Array<{
      id: string;
      exam_id: string;
      question_type: QuestionType;
      position: number;
      prompt_html: string;
      points: number;
    }>
  ): Promise<void> {
    this.requirePerm('exams:write');
    if (this.isExamLocked(examId)) throw new AppError('EXAM_LOCKED');
    const positions = new Set(rows.map((r) => r.position));
    if (positions.size !== rows.length) throw new AppError('REORDER_FAILED');
    for (const r of rows) {
      const q = this.db.examQuestions.find((x) => x.id === r.id);
      if (q) q.position = r.position;
    }
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
    this.requirePerm('exams:write');
    if (this.isExamLocked(input.exam_id)) throw new AppError('EXAM_LOCKED');
    const exam = this.db.exams.find((e) => e.id === input.exam_id);
    if (!exam) throw new AppError('UNKNOWN');

    const startMs = new Date(input.starts_at).getTime();
    if (Number.isNaN(startMs) || startMs <= Date.now()) {
      throw new AppError('SESSION_MUST_START_IN_FUTURE');
    }
    if (input.audiences.length === 0) {
      throw new AppError('SESSION_WITHOUT_AUDIENCE');
    }

    const sess: ExamSession = {
      id: uid('sess'),
      exam_id: input.exam_id,
      name: input.name.trim(),
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(startMs + exam.duration_minutes * 60 * 1000).toISOString(),
    };
    this.db.examSessions.push(sess);
    for (const aud of input.audiences) {
      this.db.sessionAudiences.push({
        id: uid('aud'),
        session_id: sess.id,
        governorate_id: aud.governorate_id,
        administration_id: aud.administration_id,
        track_id: aud.track_id,
      });
    }
    return sess;
  }

  async deleteExamSession(examId: string, sessionId: string): Promise<void> {
    this.requirePerm('exams:write');
    if (this.isExamLocked(examId)) throw new AppError('EXAM_LOCKED');
    this.db.sessionAudiences = this.db.sessionAudiences.filter((a) => a.session_id !== sessionId);
    this.db.examSessions = this.db.examSessions.filter((s) => s.id !== sessionId);
  }

  async getExamMonitoring(examId: string): Promise<ExamSessionStatRow[]> {
    this.requirePerm('exams:read');
    const detail = await this.getExamDetail(examId);
    const coverage = computeExamCoveragePreview({
      sessions: detail.sessions,
      audiences: detail.audiences,
      eligibleCourseTrackIds: detail.tracks.map((t) => t.track.id),
      governorates: this.db.governorates,
      tracks: this.db.tracks,
      students: this.db.students.map((s) => this.buildStudentOverview(s)),
    });

    return detail.sessions.map((s) => {
      const attempts = this.db.examAttempts.filter((a) => a.session_id === s.id);
      const countRow = coverage.sessionCounts.find((c) => c.sessionId === s.id);
      return {
        session_id: s.id,
        exam_id: examId,
        session_name: s.name,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        eligible_count: countRow?.count ?? 0,
        total_attempts: attempts.length,
        in_progress_count: attempts.filter((a) => a.status === 'in_progress').length,
        submitted_count: attempts.filter((a) => a.status === 'submitted').length,
        auto_submitted_count: attempts.filter((a) => a.status === 'auto_submitted').length,
      };
    });
  }

  async getQuestionStats(examId: string): Promise<QuestionStatRow[]> {
    this.requirePerm('exams:read');
    const questions = this.db.examQuestions
      .filter((q) => q.exam_id === examId)
      .sort((a, b) => a.position - b.position);
    const attempts = this.db.examAttempts.filter((a) => a.exam_id === examId);

    return questions.map((q) => {
      if (q.question_type === 'mcq') {
        const answers = this.db.mcqAnswers.filter((a) => a.question_id === q.id);
        const correct = answers.filter((a) => a.is_correct).length;
        return {
          question_id: q.id,
          position: q.position,
          question_type: q.question_type,
          prompt_html: q.prompt_html,
          points: q.points,
          attempts_count: attempts.length,
          answered_count: answers.length,
          correct_count: correct,
          correct_pct: answers.length > 0 ? Math.round((correct / answers.length) * 100) : null,
          avg_essay_score: null,
        };
      }
      const essays = this.db.essayAnswers.filter(
        (e) => e.question_id === q.id && e.score !== null
      );
      const avg =
        essays.length > 0
          ? Number((essays.reduce((acc, cur) => acc + (cur.score ?? 0), 0) / essays.length).toFixed(2))
          : null;
      return {
        question_id: q.id,
        position: q.position,
        question_type: q.question_type,
        prompt_html: q.prompt_html,
        points: q.points,
        attempts_count: attempts.length,
        answered_count: this.db.essayAnswers.filter((e) => e.question_id === q.id).length,
        correct_count: 0,
        correct_pct: null,
        avg_essay_score: avg,
      };
    });
  }

  // ---- Grading & Results ----
  async getGradingBatches(examId: string): Promise<GradingBatch[]> {
    this.requirePerm('grading:read_batches');
    return this.db.gradingBatches
      .filter((b) => b.exam_id === examId)
      .map((b) => ({
        ...b,
        exported_by_name: this.db.staff.find((s) => s.id === b.exported_by)?.full_name ?? '—',
      }));
  }

  async exportGrading(examId: string): Promise<{ batch: GradingBatch; rows: GradingExportRow[] }> {
    const actor = this.requirePerm('grading:export_import');
    if (this.db.examResults.some((r) => r.exam_id === examId)) {
      throw new AppError('ALREADY_APPROVED');
    }

    const sessions = this.db.examSessions.filter((s) => s.exam_id === examId);
    const now = Date.now();
    if (sessions.length === 0 || sessions.some((s) => new Date(s.ends_at).getTime() > now)) {
      throw new AppError('SESSIONS_NOT_ENDED');
    }

    // Auto-submit leftover in_progress attempts
    this.db.examAttempts.forEach((a) => {
      if (a.exam_id === examId && a.status === 'in_progress') {
        a.status = 'auto_submitted';
        a.submitted_at = new Date().toISOString();
      }
    });

    const essays = this.db.essayAnswers.filter((e) => e.exam_id === examId);
    const rows: GradingExportRow[] = essays.map((e) => {
      const q = this.db.examQuestions.find((x) => x.id === e.question_id);
      return {
        answer_code: e.answer_code,
        question_position: q?.position ?? 0,
        question_text: (q?.prompt_html ?? '').replace(/<[^>]+>/g, ''),
        answer_text: e.answer_text,
        max_points: q?.points ?? 0,
        score: e.score,
      };
    });

    const batch: GradingBatch = {
      id: uid('batch'),
      exam_id: examId,
      exported_by: actor.userId,
      exported_by_name: actor.profile?.full_name ?? actor.email,
      exported_at: new Date().toISOString(),
      imported_at: null,
      ai_graded: false,
      rows_count: rows.length,
    };
    this.db.gradingBatches.unshift(batch);
    this.writeAudit(actor, 'export_grading', 'grading_batch', batch.id, { exam_id: examId });
    return { batch, rows };
  }

  async importGrades(batchId: string, rows: GradeImportRow[], aiGraded: boolean): Promise<void> {
    const actor = this.requirePerm('grading:export_import');
    const batch = this.db.gradingBatches.find((b) => b.id === batchId);
    if (!batch) throw new AppError('BATCH_NOT_FOUND');
    if (this.db.examResults.some((r) => r.exam_id === batch.exam_id)) {
      throw new AppError('ALREADY_APPROVED');
    }

    const errors: ImportErrorDetail[] = [];
    const seen = new Set<string>();
    const pendingUpdates: Array<{ answer_id: string; score: number }> = [];

    rows.forEach((r, idx) => {
      const rowNum = idx + 2;
      const key = `${r.answer_code}::${r.question_position}`;
      if (seen.has(key)) {
        errors.push({ row: rowNum, code: 'DUPLICATE_ROW', message: 'صف مكرر.' });
        return;
      }
      seen.add(key);

      const ans = this.db.essayAnswers.find(
        (e) => e.exam_id === batch.exam_id && e.answer_code === r.answer_code
      );
      if (!ans) {
        errors.push({ row: rowNum, code: 'UNKNOWN_ANSWER_CODE', message: `كود غير معروف: ${r.answer_code}` });
        return;
      }

      const q = this.db.examQuestions.find(
        (x) => x.exam_id === batch.exam_id && x.position === r.question_position && x.question_type === 'essay'
      );
      if (!q) {
        errors.push({
          row: rowNum,
          code: 'UNKNOWN_ESSAY_QUESTION',
          message: `السؤال رقم ${r.question_position} غير موجود أو ليس مقاليًا.`,
        });
        return;
      }
      if (ans.question_id !== q.id) {
        errors.push({
          row: rowNum,
          code: 'NO_ANSWER_FOR_THIS_QUESTION',
          message: 'لا توجد إجابة مطابقة لهذا السؤال.',
        });
        return;
      }
      if (!Number.isFinite(r.score) || r.score < 0) {
        errors.push({ row: rowNum, code: 'INVALID_SCORE', message: 'درجة غير صالحة.' });
        return;
      }
      if (r.score > q.points) {
        errors.push({
          row: rowNum,
          code: 'SCORE_ABOVE_MAX',
          message: `الدرجة ${r.score} تتجاوز الحد الأقصى ${q.points}.`,
        });
        return;
      }
      pendingUpdates.push({ answer_id: ans.answer_id, score: r.score });
    });

    if (errors.length > 0) {
      throw new AppError('IMPORT_REJECTED', undefined, { importErrors: errors });
    }

    for (const upd of pendingUpdates) {
      const ans = this.db.essayAnswers.find((e) => e.answer_id === upd.answer_id);
      if (ans) ans.score = upd.score;
    }

    batch.imported_at = new Date().toISOString();
    batch.ai_graded = aiGraded;
    this.writeAudit(actor, 'import_grades', 'grading_batch', batch.id, {
      rows_count: pendingUpdates.length,
      ai_graded: aiGraded,
    });
  }

  async approveGrading(examId: string): Promise<void> {
    const actor = this.requirePerm('grading:approve');
    if (this.db.examResults.some((r) => r.exam_id === examId)) {
      throw new AppError('ALREADY_APPROVED');
    }
    const sessions = this.db.examSessions.filter((s) => s.exam_id === examId);
    if (sessions.some((s) => new Date(s.ends_at).getTime() > Date.now())) {
      throw new AppError('SESSIONS_NOT_ENDED');
    }

    const ungraded = this.db.essayAnswers.filter(
      (e) => e.exam_id === examId && e.score === null
    ).length;
    if (ungraded > 0) {
      throw new AppError('UNGRADED_ANSWERS', `توجد ${ungraded} إجابات مقالية غير مصححة بعد.`, {
        ungradedCount: ungraded,
      });
    }

    const questions = this.db.examQuestions.filter((q) => q.exam_id === examId);
    const maxScore = questions.reduce((acc, q) => acc + q.points, 0);
    const latestBatch = this.db.gradingBatches.find((b) => b.exam_id === examId);
    const aiGraded = latestBatch?.ai_graded ?? false;
    const now = new Date().toISOString();

    const finishedAttempts = this.db.examAttempts.filter(
      (a) => a.exam_id === examId && (a.status === 'submitted' || a.status === 'auto_submitted')
    );

    for (const att of finishedAttempts) {
      let mcqScore = 0;
      for (const mcq of this.db.mcqAnswers.filter((m) => m.attempt_id === att.id)) {
        if (mcq.is_correct) {
          const q = questions.find((x) => x.id === mcq.question_id);
          mcqScore += q?.points ?? 0;
        }
      }
      const essayScore = this.db.essayAnswers
        .filter((e) => e.attempt_id === att.id)
        .reduce((acc, e) => acc + (e.score ?? 0), 0);
      const total = mcqScore + essayScore;
      this.db.examResults.push({
        id: uid('res'),
        exam_id: examId,
        attempt_id: att.id,
        student_id: att.student_id,
        mcq_score: mcqScore,
        essay_score: essayScore,
        total_score: total,
        max_score: maxScore,
        percentage: maxScore > 0 ? Math.round((total / maxScore) * 1000) / 10 : 0,
        ai_graded: aiGraded,
        approved_at: now,
      });
    }

    this.writeAudit(actor, 'approve_grading', 'exam', examId, {
      results_count: finishedAttempts.length,
    });
  }

  async getExamResults(examId: string): Promise<ExamResultRow[]> {
    this.requirePerm('results:read');
    return this.db.examResults
      .filter((r) => r.exam_id === examId)
      .map((r) => {
        const stu = this.db.students.find((s) => s.id === r.student_id);
        return {
          ...r,
          student_name: stu?.full_name ?? '—',
          student_phone: stu?.phone ?? '—',
        };
      });
  }

  async listEssayAnswersAdmin(examId: string): Promise<EssayAnswerAdminRow[]> {
    this.requirePerm('grading:adjust_essay');
    return this.db.essayAnswers
      .filter((e) => e.exam_id === examId)
      .map((e) => {
        const att = this.db.examAttempts.find((a) => a.id === e.attempt_id);
        const stu = att ? this.db.students.find((s) => s.id === att.student_id) : undefined;
        const q = this.db.examQuestions.find((x) => x.id === e.question_id);
        return {
          answer_id: e.answer_id,
          attempt_id: e.attempt_id,
          student_id: stu?.id ?? '',
          student_name: stu?.full_name ?? '—',
          question_id: e.question_id,
          question_position: q?.position ?? 0,
          question_text: (q?.prompt_html ?? '').replace(/<[^>]+>/g, ''),
          answer_text: e.answer_text,
          max_points: q?.points ?? 0,
          score: e.score ?? 0,
          adjust_reason: e.adjust_reason,
        };
      });
  }

  async adjustEssayGrade(answerId: string, score: number, reason: string): Promise<void> {
    const actor = this.requirePerm('grading:adjust_essay');
    if (reason.trim().length < 3) throw new AppError('ADJUST_REASON_REQUIRED');
    const ans = this.db.essayAnswers.find((e) => e.answer_id === answerId);
    if (!ans) throw new AppError('ANSWER_NOT_FOUND');
    const q = this.db.examQuestions.find((x) => x.id === ans.question_id);
    if (!q) throw new AppError('ANSWER_NOT_FOUND');
    if (score < 0) throw new AppError('INVALID_SCORE');
    if (score > q.points) throw new AppError('SCORE_ABOVE_MAX');

    const prev = ans.score;
    ans.score = score;
    ans.adjust_reason = reason.trim();

    // Recompute result
    const res = this.db.examResults.find((r) => r.attempt_id === ans.attempt_id);
    if (res) {
      const essayScore = this.db.essayAnswers
        .filter((e) => e.attempt_id === ans.attempt_id)
        .reduce((acc, e) => acc + (e.score ?? 0), 0);
      res.essay_score = essayScore;
      res.total_score = res.mcq_score + essayScore;
      res.percentage =
        res.max_score > 0 ? Math.round((res.total_score / res.max_score) * 1000) / 10 : 0;
    }

    this.writeAudit(actor, 'adjust_essay_grade', 'essay_grade', answerId, {
      prev_score: prev,
      new_score: score,
      reason: ans.adjust_reason,
    });
  }

  // ---- Announcements ----
  async getAnnouncements(filter?: {
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Announcement>> {
    this.requirePerm('announcements:manage');
    const list = this.db.announcements
      .map((a) => ({
        ...a,
        track_name: a.track_id
          ? this.db.tracks.find((t) => t.id === a.track_id)?.name_ar ?? null
          : null,
        governorate_name: a.governorate_id
          ? this.db.governorates.find((g) => g.id === a.governorate_id)?.name_ar ?? null
          : null,
        sender_name: this.db.staff.find((s) => s.id === a.sent_by)?.full_name ?? '—',
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return paginate(list, filter?.page ?? 1, filter?.pageSize ?? 25);
  }

  async countAnnouncementRecipients(
    trackId: string | null,
    governorateId: string | null
  ): Promise<number> {
    this.requirePerm('announcements:manage');
    return this.db.students.filter((s) => {
      if (s.is_blocked) return false;
      if (trackId && s.track_id !== trackId) return false;
      if (governorateId && s.governorate_id !== governorateId) return false;
      return true;
    }).length;
  }

  async sendAnnouncement(input: {
    title: string;
    body: string;
    track_id: string | null;
    governorate_id: string | null;
  }): Promise<Announcement> {
    const actor = this.requirePerm('announcements:manage');
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 2 || body.length < 2) throw new AppError('ANNOUNCEMENT_EMPTY');
    if (title.length > 120 || body.length > 1000) throw new AppError('ANNOUNCEMENT_TOO_LONG');

    const count = await this.countAnnouncementRecipients(input.track_id, input.governorate_id);
    const ann: Announcement = {
      id: uid('ann'),
      title,
      body,
      track_id: input.track_id,
      governorate_id: input.governorate_id,
      recipients_count: count,
      sent_by: actor.userId,
      created_at: new Date().toISOString(),
    };
    this.db.announcements.unshift(ann);
    this.writeAudit(actor, 'send_announcement', 'announcement', ann.id, {
      recipients_count: count,
    });
    return ann;
  }

  // ---- Reports ----
  async getReportsBundle(filter: ReportsFilter): Promise<ReportBundle> {
    this.requirePerm('reports:read');
    const fromMs = filter.fromDate ? new Date(filter.fromDate).getTime() : null;
    const toMs = filter.toDate ? new Date(filter.toDate).getTime() : null;

    const inDateRange = (iso: string) => {
      const ms = new Date(iso).getTime();
      if (fromMs !== null && ms < fromMs) return false;
      if (toMs !== null && ms > toMs) return false;
      return true;
    };

    const payments = this.db.paymentRequests
      .filter((p) => {
        if (!inDateRange(p.created_at)) return false;
        if (filter.termId && p.term_id !== filter.termId) return false;
        if (filter.trackId && p.track_id !== filter.trackId) return false;
        return true;
      })
      .map((p) => this.buildPaymentRow(p));

    const subscriptions = this.db.subscriptions
      .map((s) => this.buildSubscriptionRow(s))
      .filter((s) => {
        if (!inDateRange(s.created_at)) return false;
        if (filter.termId && s.term_id !== filter.termId) return false;
        if (filter.trackId && s.track_id !== filter.trackId) return false;
        if (filter.stageId && s.stage_id !== filter.stageId) return false;
        return true;
      });

    const students = this.db.students
      .map((s) => this.buildStudentOverview(s))
      .filter((s) => {
        if (!inDateRange(s.created_at)) return false;
        if (filter.trackId && s.track_id !== filter.trackId) return false;
        if (filter.stageId && s.stage_id !== filter.stageId) return false;
        return true;
      });

    const lessons = this.db.lessons
      .map((l) => this.buildLessonWithContext(l))
      .filter((l) => {
        if (filter.termId && l.term_id !== filter.termId) return false;
        if (filter.trackId && !l.tracks.some((t) => t.track_id === filter.trackId)) return false;
        if (filter.stageId && !l.tracks.some((t) => t.stage_id === filter.stageId)) return false;
        return true;
      });

    const exams = this.db.exams.filter((e) => {
      if (filter.termId && e.term_id !== filter.termId) return false;
      return true;
    });

    const results = this.db.examResults.map((r) => ({
      ...r,
      exam_title: this.db.exams.find((e) => e.id === r.exam_id)?.title,
      student_name: this.db.students.find((s) => s.id === r.student_id)?.full_name,
    }));

    return {
      truncated: false,
      totalFetched: payments.length + subscriptions.length + students.length,
      payments,
      subscriptions,
      students,
      lessons,
      exams,
      results,
      itemProgressCount: this.db.itemProgress.length,
      quickAnswersStats: {
        total: this.db.quickAnswers.length,
        correct: this.db.quickAnswers.filter((q) => q.is_correct).length,
      },
    };
  }

  // ---- Staff & Roles ----
  async getStaffList(): Promise<StaffProfile[]> {
    this.requirePerm('staff:manage');
    return [...this.db.staff];
  }

  async createStaffMember(input: {
    email: string;
    full_name: string;
    password: string;
    roles: StaffRole[];
  }): Promise<StaffProfile> {
    const actor = this.requirePerm('staff:manage');
    const cleanEmail = input.email.trim().toLowerCase();
    if (this.db.staff.some((s) => s.email.toLowerCase() === cleanEmail)) {
      throw new AppError('EMAIL_EXISTS');
    }
    if (input.roles.length === 0) throw new AppError('INVALID_ROLES');

    const created: StaffProfile = {
      id: uid('staff'),
      email: cleanEmail,
      full_name: input.full_name.trim(),
      is_active: true,
      created_at: new Date().toISOString(),
      roles: [...input.roles],
    };
    this.db.staff.push(created);
    this.writeAudit(actor, 'create_staff', 'staff_profile', created.id, {
      roles: input.roles,
    });
    return created;
  }

  async updateStaffRoles(staffId: string, roles: StaffRole[]): Promise<void> {
    const actor = this.requirePerm('staff:manage');
    if (roles.length === 0) throw new AppError('INVALID_ROLES');
    const target = this.db.staff.find((s) => s.id === staffId);
    if (!target) throw new AppError('UNKNOWN');

    const hadAdmin = target.roles.includes('admin');
    const keepsAdmin = roles.includes('admin');
    if (hadAdmin && !keepsAdmin) {
      const activeAdmins = this.db.staff.filter(
        (s) => s.is_active && s.roles.includes('admin')
      );
      if (activeAdmins.length <= 1) {
        throw new AppError('LAST_ADMIN');
      }
    }

    target.roles = [...roles];
    if (this.session?.userId === staffId) {
      this.session = { ...this.session, roles: [...roles] };
      this.persistSession();
    }
    this.writeAudit(actor, 'update_staff_roles', 'staff_roles', staffId, { roles });
  }

  async setStaffActive(staffId: string, isActive: boolean): Promise<void> {
    const actor = this.requirePerm('staff:manage');
    const target = this.db.staff.find((s) => s.id === staffId);
    if (!target) throw new AppError('UNKNOWN');
    if (!isActive && target.roles.includes('admin')) {
      const activeAdmins = this.db.staff.filter(
        (s) => s.is_active && s.roles.includes('admin')
      );
      if (activeAdmins.length <= 1) {
        throw new AppError('LAST_ADMIN');
      }
    }
    target.is_active = isActive;
    this.writeAudit(actor, 'set_staff_active', 'staff_profile', staffId, { is_active: isActive });
  }

  // ---- Audit ----
  async getAuditLog(filter: AuditFilter): Promise<PaginatedResult<AuditLogEntry>> {
    this.requirePerm('audit:read');
    let list = [...this.db.auditLog];
    if (filter.action) list = list.filter((a) => a.action === filter.action);
    if (filter.entityType) list = list.filter((a) => a.entity_type === filter.entityType);
    if (filter.actorId) list = list.filter((a) => a.actor_id === filter.actorId);
    if (filter.fromDate) {
      const from = new Date(filter.fromDate).getTime();
      list = list.filter((a) => new Date(a.created_at).getTime() >= from);
    }
    if (filter.toDate) {
      const to = new Date(filter.toDate).getTime();
      list = list.filter((a) => new Date(a.created_at).getTime() <= to);
    }
    return paginate(list, filter.page ?? 1, filter.pageSize ?? 25);
  }

  // ---- Year End ----
  async getYearEndReports(): Promise<YearEndReport[]> {
    this.requirePerm('year_end:manage');
    return [...this.db.yearEndReports];
  }

  async registerYearEndReport(
    academicYear: string,
    pdfPath: string,
    _studentId?: string
  ): Promise<YearEndReport> {
    const actor = this.requirePerm('year_end:manage');
    if (!/^\d{4}-\d{4}$/.test(academicYear.trim())) throw new AppError('INVALID_ACADEMIC_YEAR');
    if (!pdfPath.trim()) throw new AppError('PDF_PATH_REQUIRED');
    if (this.db.yearEndReports.some((r) => r.academic_year === academicYear.trim())) {
      throw new AppError('DUPLICATE');
    }

    const row: YearEndReport = {
      id: uid('yer'),
      academic_year: academicYear.trim(),
      pdf_path: pdfPath.trim(),
      registered_by: actor.userId,
      registered_at: new Date().toISOString(),
      purged_at: null,
    };
    this.db.yearEndReports.unshift(row);
    this.writeAudit(actor, 'register_year_end_report', 'year_end_reports', row.id, {
      academic_year: row.academic_year,
    });
    return row;
  }

  async purgeYearEndDetails(academicYear: string, confirmation: string): Promise<number> {
    const actor = this.requirePerm('year_end:manage');
    if (confirmation.trim() !== 'DELETE') throw new AppError('CONFIRMATION_REQUIRED');
    const rep = this.db.yearEndReports.find((r) => r.academic_year === academicYear.trim());
    if (!rep) throw new AppError('INVALID_ACADEMIC_YEAR', 'لم يتم تسجيل تقرير لهذا العام الدراسي بعد.');

    const purgedCount = this.db.itemProgress.length + this.db.quickAnswers.length;
    this.db.itemProgress = [];
    this.db.quickAnswers = [];
    rep.purged_at = new Date().toISOString();
    this.writeAudit(actor, 'purge_year_end_details', 'year_end_reports', rep.id, {
      academic_year: rep.academic_year,
      purged_records: purgedCount,
    });
    return purgedCount;
  }

  // ---- Mock verification helpers (student access & lifecycle checks) ----
  async checkStudentAccessMock(studentId: string, termId: string): Promise<boolean> {
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu || stu.is_blocked) return false;
    const now = Date.now();
    if (new Date(stu.trial_ends_at).getTime() > now) return true;
    return this.db.subscriptions.some(
      (sub) =>
        sub.student_id === stu.id &&
        sub.track_id === stu.track_id &&
        sub.term_id === termId &&
        sub.status === 'active' &&
        new Date(sub.ends_at).getTime() > now
    );
  }

  async getStudentVisibleLessonsMock(
    studentId: string,
    courseId: string,
    termId: string
  ): Promise<Lesson[]> {
    const hasAccess = await this.checkStudentAccessMock(studentId, termId);
    if (!hasAccess) return [];
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu) return [];
    const courseLinked = this.db.trackCourses.some(
      (tc) => tc.track_id === stu.track_id && tc.course_id === courseId
    );
    if (!courseLinked) return [];
    return this.db.lessons.filter(
      (l) => l.course_id === courseId && l.term_id === termId && l.status === 'published'
    );
  }

  async createStudentPaymentRequestMock(
    studentId: string,
    termId: string,
    senderPhone: string
  ): Promise<void> {
    const stu = this.db.students.find((s) => s.id === studentId);
    if (!stu) throw new AppError('STUDENT_NOT_FOUND');
    const plan = this.db.plans.find(
      (p) => p.track_id === stu.track_id && p.term_id === termId && p.is_active
    );
    if (!plan) throw new AppError('NO_PLAN_FOR_TRACK_TERM');
    const pendingExists = this.db.paymentRequests.some(
      (r) => r.student_id === studentId && r.term_id === termId && r.status === 'pending'
    );
    if (pendingExists) throw new AppError('PENDING_REQUEST_EXISTS');

    this.db.paymentRequests.push({
      id: uid('pay'),
      student_id: stu.id,
      track_id: stu.track_id,
      term_id: termId,
      amount_egp: plan.price_egp,
      sender_phone: senderPhone,
      proof_path: null,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      reject_reason: null,
      created_at: new Date().toISOString(),
    });
  }

  async simulateExamSessionStartMock(sessionId: string): Promise<void> {
    const sess = this.db.examSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    const exam = this.db.exams.find((e) => e.id === sess.exam_id);
    const dur = (exam?.duration_minutes ?? 60) * 60 * 1000;
    const pastStart = Date.now() - 10 * 60 * 1000;
    sess.starts_at = new Date(pastStart).toISOString();
    sess.ends_at = new Date(pastStart + dur).toISOString();
  }

  async simulateExamSessionsEndMock(examId: string): Promise<void> {
    const pastEnd = Date.now() - 60 * 1000;
    this.db.examSessions
      .filter((s) => s.exam_id === examId)
      .forEach((s) => {
        s.starts_at = new Date(pastEnd - 60 * 60 * 1000).toISOString();
        s.ends_at = new Date(pastEnd).toISOString();
      });
  }
}
