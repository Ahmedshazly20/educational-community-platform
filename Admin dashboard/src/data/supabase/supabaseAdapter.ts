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
  SessionAudience,
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
import { AppError, normalizeError } from '../../lib/errors';
import { requiresMfa } from '../../lib/permissions';
import { sanitizeArticleHtml } from '../../lib/sanitize';
import { getSupabaseClient } from './supabaseClient';

function unwrap<T>(data: T | null, error: unknown): T {
  if (error) throw normalizeError(error);
  if (data === null) throw new AppError('UNKNOWN');
  return data;
}

function unwrapList<T>(data: T[] | null, error: unknown): T[] {
  if (error) throw normalizeError(error);
  return data ?? [];
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

export class SupabaseAdminApi implements AdminApi {
  private sb: ReturnType<typeof getSupabaseClient>;

  constructor(client?: ReturnType<typeof getSupabaseClient>) {
    this.sb = client ?? getSupabaseClient();
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
      this.sb.from('payment_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      this.sb
        .from('payment_requests')
        .select('created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      this.sb
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_blocked', false)
        .gt('trial_ends_at', nowIso),
      this.sb
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_blocked', false)
        .gt('trial_ends_at', nowIso)
        .lte('trial_ends_at', in7Iso),
      this.sb.from('profiles').select('*', { count: 'exact', head: true }).eq('is_blocked', true),
      this.sb.from('terms').select('*').order('sort_order'),
      this.sb
        .from('exam_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('ends_at', nowIso)
        .lte('starts_at', in24Iso),
      this.sb.from('exam_attempts').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      this.sb.from('exams').select('id').eq('status', 'published'),
      this.sb.from('exam_results').select('exam_id'),
      this.sb.from('lessons').select('*', { count: 'exact', head: true }).eq('status', 'published'),
      this.sb.from('lessons').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
      this.sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(10),
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

    const terms = (termsRes.data ?? []) as Term[];
    const activeSubsByTerm = await Promise.all(
      terms.map(async (t) => {
        const { count } = await this.sb
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('term_id', t.id)
          .eq('status', 'active')
          .gt('ends_at', nowIso);
        return { term_id: t.id, term_name: t.name_ar, count: count ?? 0 };
      })
    );

    const oldestDate = oldestPendingRes.data?.created_at as string | undefined;
    const oldestPendingDays = oldestDate
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestDate).getTime()) / 86400_000))
      : null;

    const approvedExamIds = new Set(
      ((approvedResultsRes.data ?? []) as Array<{ exam_id: string }>).map((r) => r.exam_id)
    );
    const examsAwaitingGradingCount = ((pubExamsRes.data ?? []) as Array<{ id: string }>).filter(
      (e) => !approvedExamIds.has(e.id)
    ).length;

    const rawAudit = (auditRes.data ?? []) as Array<{
      id: number | string;
      actor_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      details: Record<string, unknown>;
      created_at: string;
    }>;
    const actorIds = Array.from(new Set(rawAudit.map((r) => r.actor_id).filter(Boolean)));
    const actorNameMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: staffRows } = await this.sb
        .from('staff_profiles')
        .select('user_id, full_name')
        .in('user_id', actorIds);
      for (const s of (staffRows ?? []) as Array<{ user_id: string; full_name: string }>) {
        actorNameMap.set(s.user_id, s.full_name);
      }
    }

    const recentAudit: AuditLogEntry[] = rawAudit.map((r) => ({
      id: String(r.id),
      actor_id: r.actor_id,
      actor_name: actorNameMap.get(r.actor_id) ?? r.actor_id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      details: r.details ?? {},
      created_at: r.created_at,
    }));

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
    const { data, error } = await this.sb.from('governorates').select('*').order('sort_order');
    return unwrapList(data as Governorate[] | null, error);
  }

  async createGovernorate(input: { name_ar: string; sort_order: number }): Promise<Governorate> {
    const { data, error } = await this.sb.from('governorates').insert(input).select().single();
    return unwrap(data as Governorate | null, error);
  }

  async updateGovernorate(id: string, input: { name_ar: string; sort_order: number }): Promise<Governorate> {
    const { data, error } = await this.sb
      .from('governorates')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    return unwrap(data as Governorate | null, error);
  }

  async deleteGovernorate(id: string): Promise<void> {
    const { error } = await this.sb.from('governorates').delete().eq('id', id);
    if (error) throw normalizeError(error);
  }

  async getAdministrations(governorateId?: string): Promise<Administration[]> {
    let q = this.sb.from('administrations').select('*').order('name_ar');
    if (governorateId) q = q.eq('governorate_id', governorateId);
    const { data, error } = await q;
    return unwrapList(data as Administration[] | null, error);
  }

  async createAdministration(input: {
    governorate_id: string;
    name_ar: string;
    is_active: boolean;
  }): Promise<Administration> {
    const { data, error } = await this.sb.from('administrations').insert(input).select().single();
    return unwrap(data as Administration | null, error);
  }

  async updateAdministration(id: string, input: { name_ar: string; is_active: boolean }): Promise<Administration> {
    const { data, error } = await this.sb
      .from('administrations')
      .update(input)
      .eq('id', id)
      .select()
      .single();
    return unwrap(data as Administration | null, error);
  }

  async deleteAdministration(id: string): Promise<void> {
    const { error } = await this.sb.from('administrations').delete().eq('id', id);
    if (error) throw normalizeError(error);
  }

  async bulkImportAdministrations(
    rows: Array<{ governorate: string; administration: string }>
  ): Promise<{ inserted: number; skippedDuplicates: number; unknownGovernorates: string[] }> {
    const [govs, existing] = await Promise.all([this.getGovernorates(), this.getAdministrations()]);
    const toInsert: Array<{ governorate_id: string; name_ar: string; is_active: boolean }> = [];
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
      toInsert.push({ governorate_id: gov.id, name_ar: r.administration.trim(), is_active: true });
    }

    if (toInsert.length > 0) {
      const { error } = await this.sb.from('administrations').insert(toInsert);
      if (error) throw normalizeError(error);
    }
    return { inserted: toInsert.length, skippedDuplicates, unknownGovernorates: Array.from(unknown) };
  }

  async getStages(): Promise<Stage[]> {
    const { data, error } = await this.sb.from('stages').select('*').order('sort_order');
    return unwrapList(data as Stage[] | null, error);
  }

  async createStage(input: { name_ar: string; sort_order: number }): Promise<Stage> {
    const { data, error } = await this.sb.from('stages').insert(input).select().single();
    return unwrap(data as Stage | null, error);
  }

  async updateStage(id: string, input: { name_ar: string; sort_order: number }): Promise<Stage> {
    const { data, error } = await this.sb.from('stages').update(input).eq('id', id).select().single();
    return unwrap(data as Stage | null, error);
  }

  async reorderStages(items: Array<{ id: string; name_ar: string; sort_order: number }>): Promise<void> {
    const { error } = await this.sb.from('stages').upsert(items, { onConflict: 'id' });
    if (error) throw new AppError('REORDER_FAILED');
  }

  async checkStageDependencies(id: string): Promise<DependencyCheckResult> {
    const { count } = await this.sb
      .from('tracks')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', id);
    const c = count ?? 0;
    return {
      canDelete: c === 0,
      dependencies: c > 0 ? [{ label: 'مسار/شعبة', count: c }] : [],
    };
  }

  async deleteStage(id: string): Promise<void> {
    const { error } = await this.sb.from('stages').delete().eq('id', id);
    if (error) throw normalizeError(error);
  }

  async getTracks(stageId?: string): Promise<Track[]> {
    let q = this.sb.from('tracks').select('*').order('sort_order');
    if (stageId) q = q.eq('stage_id', stageId);
    const { data, error } = await q;
    return unwrapList(data as Track[] | null, error);
  }

  async createTrack(input: {
    stage_id: string;
    name_ar: string;
    is_active: boolean;
    sort_order: number;
  }): Promise<Track> {
    const { data, error } = await this.sb.from('tracks').insert(input).select().single();
    return unwrap(data as Track | null, error);
  }

  async updateTrack(
    id: string,
    input: { stage_id: string; name_ar: string; is_active: boolean; sort_order: number }
  ): Promise<Track> {
    const { data, error } = await this.sb.from('tracks').update(input).eq('id', id).select().single();
    return unwrap(data as Track | null, error);
  }

  async checkTrackDependencies(id: string): Promise<DependencyCheckResult> {
    const [stu, pl, sub, pay] = await Promise.all([
      this.sb.from('profiles').select('*', { count: 'exact', head: true }).eq('track_id', id),
      this.sb.from('plans').select('*', { count: 'exact', head: true }).eq('track_id', id),
      this.sb.from('subscriptions').select('*', { count: 'exact', head: true }).eq('track_id', id),
      this.sb.from('payment_requests').select('*', { count: 'exact', head: true }).eq('track_id', id),
    ]);
    const deps = [];
    if ((stu.count ?? 0) > 0) deps.push({ label: 'طالب', count: stu.count ?? 0 });
    if ((pl.count ?? 0) > 0) deps.push({ label: 'خطة تسعير', count: pl.count ?? 0 });
    if ((sub.count ?? 0) > 0) deps.push({ label: 'اشتراك', count: sub.count ?? 0 });
    if ((pay.count ?? 0) > 0) deps.push({ label: 'طلب دفع', count: pay.count ?? 0 });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteTrack(id: string): Promise<void> {
    const { error } = await this.sb.from('tracks').delete().eq('id', id);
    if (error) throw normalizeError(error);
  }

  async getCourses(): Promise<Course[]> {
    const { data, error } = await this.sb.from('courses').select('*').order('sort_order');
    return unwrapList(data as Course[] | null, error);
  }

  async createCourse(input: {
    name_ar: string;
    icon_key: CourseIconKey;
    sort_order: number;
    is_active: boolean;
  }): Promise<Course> {
    const { data, error } = await this.sb.from('courses').insert(input).select().single();
    return unwrap(data as Course | null, error);
  }

  async updateCourse(
    id: string,
    input: { name_ar: string; icon_key: CourseIconKey; sort_order: number; is_active: boolean }
  ): Promise<Course> {
    const { data, error } = await this.sb.from('courses').update(input).eq('id', id).select().single();
    return unwrap(data as Course | null, error);
  }

  async checkCourseDependencies(id: string): Promise<DependencyCheckResult> {
    const [les, ex] = await Promise.all([
      this.sb.from('lessons').select('*', { count: 'exact', head: true }).eq('course_id', id),
      this.sb.from('exams').select('*', { count: 'exact', head: true }).eq('course_id', id),
    ]);
    const deps = [];
    if ((les.count ?? 0) > 0) deps.push({ label: 'درس', count: les.count ?? 0 });
    if ((ex.count ?? 0) > 0) deps.push({ label: 'امتحان', count: ex.count ?? 0 });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteCourse(id: string): Promise<void> {
    const { error } = await this.sb.from('courses').delete().eq('id', id);
    if (error) throw normalizeError(error);
  }

  async getTrackCourses(): Promise<TrackCourse[]> {
    const { data, error } = await this.sb.from('track_courses').select('*').order('sort_order');
    return unwrapList(data as TrackCourse[] | null, error);
  }

  async linkTrackCourse(input: {
    track_id: string;
    course_id: string;
    sort_order: number;
  }): Promise<TrackCourse> {
    const { data, error } = await this.sb.from('track_courses').insert(input).select().single();
    return unwrap(data as TrackCourse | null, error);
  }

  async unlinkTrackCourse(trackId: string, courseId: string): Promise<void> {
    const { error } = await this.sb
      .from('track_courses')
      .delete()
      .eq('track_id', trackId)
      .eq('course_id', courseId);
    if (error) throw normalizeError(error);
  }

  async getTerms(): Promise<Term[]> {
    const { data, error } = await this.sb.from('terms').select('*').order('sort_order');
    return unwrapList(data as Term[] | null, error);
  }

  async createTerm(input: {
    name_ar: string;
    sort_order: number;
    access_ends_at: string | null;
  }): Promise<Term> {
    const { data, error } = await this.sb.from('terms').insert(input).select().single();
    return unwrap(data as Term | null, error);
  }

  async updateTerm(
    id: string,
    input: { name_ar: string; sort_order: number; access_ends_at: string | null }
  ): Promise<Term> {
    const { data, error } = await this.sb.from('terms').update(input).eq('id', id).select().single();
    return unwrap(data as Term | null, error);
  }

  async checkTermDependencies(id: string): Promise<DependencyCheckResult> {
    const [l, e, p, s] = await Promise.all([
      this.sb.from('lessons').select('*', { count: 'exact', head: true }).eq('term_id', id),
      this.sb.from('exams').select('*', { count: 'exact', head: true }).eq('term_id', id),
      this.sb.from('plans').select('*', { count: 'exact', head: true }).eq('term_id', id),
      this.sb.from('subscriptions').select('*', { count: 'exact', head: true }).eq('term_id', id),
    ]);
    const deps = [];
    if ((l.count ?? 0) > 0) deps.push({ label: 'درس', count: l.count ?? 0 });
    if ((e.count ?? 0) > 0) deps.push({ label: 'امتحان', count: e.count ?? 0 });
    if ((p.count ?? 0) > 0) deps.push({ label: 'خطة تسعير', count: p.count ?? 0 });
    if ((s.count ?? 0) > 0) deps.push({ label: 'اشتراك', count: s.count ?? 0 });
    return { canDelete: deps.length === 0, dependencies: deps };
  }

  async deleteTerm(id: string): Promise<void> {
    const { error } = await this.sb.from('terms').delete().eq('id', id);
    if (error) throw normalizeError(error);
  }

  async getAllowedLinkDomains(): Promise<AllowedLinkDomain[]> {
    const { data, error } = await this.sb.from('allowed_link_domains').select('*').order('domain');
    if (error) throw normalizeError(error);
    return ((data ?? []) as Array<{ domain: string; kind: LinkKind; is_active: boolean }>).map((r) => ({
      id: r.domain,
      domain: r.domain,
      kind: r.kind,
      is_active: r.is_active,
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
        is_active: input.is_active,
      })
      .select()
      .single();
    const row = unwrap(data as { domain: string; kind: LinkKind; is_active: boolean } | null, error);
    return { id: row.domain, domain: row.domain, kind: row.kind, is_active: row.is_active };
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
        is_active: input.is_active,
      })
      .eq('domain', id)
      .select()
      .single();
    const row = unwrap(data as { domain: string; kind: LinkKind; is_active: boolean } | null, error);
    return { id: row.domain, domain: row.domain, kind: row.kind, is_active: row.is_active };
  }

  async deleteAllowedLinkDomain(id: string): Promise<void> {
    const { error } = await this.sb.from('allowed_link_domains').delete().eq('domain', id);
    if (error) throw normalizeError(error);
  }

  async getLessons(filter: LessonsFilter): Promise<PaginatedResult<LessonWithContext>> {
    const [from, to] = getRange(filter.page ?? 1, filter.pageSize ?? 50);
    const [tcs, tracks, stages] = await Promise.all([
      this.getTrackCourses(),
      this.getTracks(),
      this.getStages(),
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
      .select('*, courses(name_ar), terms(name_ar), lesson_items(id, item_type)', { count: 'exact' })
      .order('sort_order');

    if (filter.courseId) q = q.eq('course_id', filter.courseId);
    if (allowedCourseIds) q = q.in('course_id', Array.from(new Set(allowedCourseIds)));
    if (filter.termId) q = q.eq('term_id', filter.termId);
    if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      q = q.or(`title.ilike.${term},summary.ilike.${term}`);
    }
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);

    const items = (data ?? []).map((row: Record<string, unknown>) => {
      const cId = String(row.course_id);
      const linkedTracks = tcs
        .filter((tc) => tc.course_id === cId)
        .map((tc) => {
          const tr = tracks.find((t) => t.id === tc.track_id);
          const st = tr ? stages.find((s) => s.id === tr.stage_id) : undefined;
          return tr && st
            ? { track_id: tr.id, track_name: tr.name_ar, stage_id: st.id, stage_name: st.name_ar }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const rawItems = (row.lesson_items as Array<{ id: string; item_type: LessonItemType }>) ?? [];
      return {
        ...(row as unknown as Lesson),
        course_name: (row.courses as { name_ar?: string } | null)?.name_ar ?? '—',
        term_name: (row.terms as { name_ar?: string } | null)?.name_ar ?? '—',
        tracks: linkedTracks,
        items_count: rawItems.length,
        item_types: Array.from(new Set(rawItems.map((i) => i.item_type))),
      };
    });

    return { items, total: count ?? items.length };
  }

  async getLessonDetail(lessonId: string): Promise<LessonDetailData> {
    const { data: lesson, error } = await this.sb.from('lessons').select('*').eq('id', lessonId).single();
    if (error) throw normalizeError(error);
    const les = lesson as Lesson;

    const [courseRes, termRes, tcs, tracks, stages, itemsRes] = await Promise.all([
      this.sb.from('courses').select('*').eq('id', les.course_id).single(),
      this.sb.from('terms').select('*').eq('id', les.term_id).single(),
      this.getTrackCourses(),
      this.getTracks(),
      this.getStages(),
      this.sb
        .from('lesson_items')
        .select('*, quick_questions(*, quick_question_options(*))')
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
      course: courseRes.data as Course,
      term: termRes.data as Term,
      tracks: linkedTracks,
      items: (itemsRes.data ?? []) as LessonItem[],
    };
  }

  async createLesson(input: {
    course_id: string;
    term_id: string;
    title: string;
    summary: string | null;
  }): Promise<Lesson> {
    const { data: maxRow } = await this.sb
      .from('lessons')
      .select('sort_order')
      .eq('course_id', input.course_id)
      .eq('term_id', input.term_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;
    const { data, error } = await this.sb
      .from('lessons')
      .insert({ ...input, sort_order: nextOrder, status: 'draft' })
      .select()
      .single();
    return unwrap(data as Lesson | null, error);
  }

  async updateLessonMeta(
    lessonId: string,
    input: { title: string; summary: string | null }
  ): Promise<Lesson> {
    const { data, error } = await this.sb
      .from('lessons')
      .update(input)
      .eq('id', lessonId)
      .select()
      .single();
    return unwrap(data as Lesson | null, error);
  }

  async setLessonStatus(lessonId: string, status: LessonStatus): Promise<Lesson> {
    const payload: Record<string, unknown> = { status };
    if (status === 'published') payload.published_at = new Date().toISOString();
    const { data, error } = await this.sb
      .from('lessons')
      .update(payload)
      .eq('id', lessonId)
      .select()
      .single();
    return unwrap(data as Lesson | null, error);
  }

  async reorderLessons(
    rows: Array<{ id: string; course_id: string; term_id: string; title: string; sort_order: number }>
  ): Promise<void> {
    const { error } = await this.sb.from('lessons').upsert(rows, { onConflict: 'id' });
    if (error) throw new AppError('REORDER_FAILED');
  }

  async getLessonDeleteImpact(lessonId: string): Promise<{ progressCount: number; answersCount: number }> {
    const { data: items } = await this.sb.from('lesson_items').select('id').eq('lesson_id', lessonId);
    const ids = (items ?? []).map((i: { id: string }) => i.id);
    if (ids.length === 0) return { progressCount: 0, answersCount: 0 };
    const [{ count: progressCount }, { data: qqRows }] = await Promise.all([
      this.sb.from('item_progress').select('*', { count: 'exact', head: true }).in('item_id', ids),
      this.sb.from('quick_questions').select('id').in('item_id', ids),
    ]);
    const qIds = ((qqRows ?? []) as Array<{ id: string }>).map((q) => q.id);
    let answersCount = 0;
    if (qIds.length > 0) {
      const { count } = await this.sb
        .from('quick_answers')
        .select('*', { count: 'exact', head: true })
        .in('question_id', qIds);
      answersCount = count ?? 0;
    }
    return { progressCount: progressCount ?? 0, answersCount };
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
    const { data: maxRow } = await this.sb
      .from('lesson_items')
      .select('sort_order')
      .eq('lesson_id', input.lesson_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;

    const payload: Record<string, unknown> = {
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
      payload.url = input.url;
    }
    const { data, error } = await this.sb.from('lesson_items').insert(payload).select().single();
    return unwrap(data as LessonItem | null, error);
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
    const payload: Record<string, unknown> = { title: input.title };
    if (input.body_json !== undefined) payload.body_json = input.body_json;
    if (input.body_html !== undefined) payload.body_html = sanitizeArticleHtml(input.body_html ?? '');
    if (input.url !== undefined) payload.url = input.url;

    const { data, error } = await this.sb
      .from('lesson_items')
      .update(payload)
      .eq('id', itemId)
      .select()
      .single();
    return unwrap(data as LessonItem | null, error);
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
    const { error } = await this.sb.from('lesson_items').upsert(rows, { onConflict: 'id' });
    if (error) throw new AppError('REORDER_FAILED');
  }

  async getLessonItemDeleteImpact(itemId: string): Promise<{ progressCount: number; answersCount: number }> {
    const [{ count }, { data: qqRows }] = await Promise.all([
      this.sb
        .from('item_progress')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', itemId),
      this.sb.from('quick_questions').select('id').eq('item_id', itemId),
    ]);
    const qIds = ((qqRows ?? []) as Array<{ id: string }>).map((q) => q.id);
    let answersCount = 0;
    if (qIds.length > 0) {
      const { count: aCount } = await this.sb
        .from('quick_answers')
        .select('*', { count: 'exact', head: true })
        .in('question_id', qIds);
      answersCount = aCount ?? 0;
    }
    return { progressCount: count ?? 0, answersCount };
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
      const { data: maxRow } = await this.sb
        .from('quick_questions')
        .select('sort_order')
        .eq('item_id', input.item_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
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
      await this.sb.from('quick_question_options').delete().eq('question_id', qId);
    }

    if (input.options.length > 0) {
      const { error: optErr } = await this.sb.from('quick_question_options').insert(
        input.options.map((o, idx) => ({
          question_id: qId,
          option_text: o.option_text,
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
    const { error } = await this.sb.from('quick_questions').upsert(rows, { onConflict: 'id' });
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
    const { data, error } = await this.sb.from('plans').select('*').order('created_at', { ascending: false });
    return unwrapList(data as Plan[] | null, error);
  }

  async createPlan(input: {
    track_id: string;
    term_id: string;
    price_egp: number;
    is_active: boolean;
  }): Promise<Plan> {
    const { data, error } = await this.sb.from('plans').insert(input).select().single();
    return unwrap(data as Plan | null, error);
  }

  async updatePlan(id: string, input: { price_egp: number; is_active: boolean }): Promise<Plan> {
    const { data, error } = await this.sb.from('plans').update(input).eq('id', id).select().single();
    return unwrap(data as Plan | null, error);
  }

  async deletePlan(id: string): Promise<void> {
    const { error } = await this.sb.from('plans').delete().eq('id', id);
    if (error) throw normalizeError(error);
  }

  async getSubscriptions(filter: SubscriptionsFilter): Promise<PaginatedResult<Subscription>> {
    const [from, to] = getRange(filter.page ?? 1, filter.pageSize ?? 25);

    let stageTrackIds: string[] | null = null;
    if (filter.stageId && !filter.trackId) {
      const tracks = await this.getTracks(filter.stageId);
      stageTrackIds = tracks.map((t) => t.id);
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
      .select('*, profiles(full_name, phone), tracks(name_ar, stage_id), terms(name_ar)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
    if (filter.termId) q = q.eq('term_id', filter.termId);
    if (filter.trackId) q = q.eq('track_id', filter.trackId);
    if (stageTrackIds) q = q.in('track_id', stageTrackIds);
    if (matchingStudentIds) q = q.in('student_id', matchingStudentIds);
    if (filter.fromDate) q = q.gte('starts_at', filter.fromDate);
    if (filter.toDate) q = q.lte('starts_at', filter.toDate);
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);

    const items = (data ?? []).map((r: Record<string, unknown>) => ({
      ...(r as unknown as Subscription),
      student_name: (r.profiles as { full_name?: string } | null)?.full_name,
      student_phone: (r.profiles as { phone?: string } | null)?.phone,
      track_name: (r.tracks as { name_ar?: string; stage_id?: string } | null)?.name_ar,
      stage_id: (r.tracks as { stage_id?: string } | null)?.stage_id,
      term_name: (r.terms as { name_ar?: string } | null)?.name_ar,
    }));
    return { items, total: count ?? items.length };
  }

  async grantSubscription(input: {
    student_id: string;
    term_id: string;
    ends_at: string;
    note?: string;
  }): Promise<Subscription> {
    const { data, error } = await this.sb.rpc('grant_subscription', {
      p_student_id: input.student_id,
      p_term_id: input.term_id,
      p_ends_at: input.ends_at,
      p_note: input.note ?? null,
    });
    return unwrap(data as Subscription | null, error);
  }

  async getPaymentQueue(filter: PaymentQueueFilter): Promise<PaginatedResult<PaymentQueueRow>> {
    const [from, to] = getRange(filter.page ?? 1, filter.pageSize ?? 25);
    let q = this.sb
      .from('v_payment_queue')
      .select('*', { count: 'exact' })
      .eq('status', filter.status)
      .order('created_at', { ascending: filter.status === 'pending' });
    if (filter.termId) q = q.eq('term_id', filter.termId);
    if (filter.trackId) q = q.eq('track_id', filter.trackId);
    if (filter.fromDate) q = q.gte('created_at', filter.fromDate);
    if (filter.toDate) q = q.lte('created_at', filter.toDate);
    if (filter.search?.trim()) {
      const s = `%${filter.search.trim()}%`;
      q = q.or(`student_name.ilike.${s},student_phone.ilike.${s},sender_phone.ilike.${s}`);
    }
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);
    return { items: (data ?? []) as PaymentQueueRow[], total: count ?? 0 };
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
    return unwrap(data as Subscription | null, error);
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
    let q = this.sb
      .from('v_students_overview')
      .select('*', { count: 'exact' })
      .order(filter.sortBy ?? 'created_at', { ascending: filter.sortDir === 'asc' });

    if (filter.search?.trim()) {
      const s = `%${filter.search.trim()}%`;
      q = q.or(`full_name.ilike.${s},phone.ilike.${s}`);
    }
    if (filter.governorateId) q = q.eq('governorate_id', filter.governorateId);
    if (filter.administrationId) q = q.eq('administration_id', filter.administrationId);
    if (filter.stageId) q = q.eq('stage_id', filter.stageId);
    if (filter.trackId) q = q.eq('track_id', filter.trackId);
    if (filter.status && filter.status !== 'all') {
      if (filter.status === 'blocked') {
        q = q.eq('is_blocked', true);
      } else if (filter.status === 'subscribed') {
        q = q.eq('is_blocked', false).gt('active_subscriptions_count', 0);
      } else if (filter.status === 'trial') {
        q = q.eq('is_blocked', false).eq('active_subscriptions_count', 0).gt('trial_ends_at', nowIso);
      } else if (filter.status === 'expired') {
        q = q.eq('is_blocked', false).eq('active_subscriptions_count', 0).lte('trial_ends_at', nowIso);
      }
    }
    if (filter.fromDate) q = q.gte('created_at', filter.fromDate);
    if (filter.toDate) q = q.lte('created_at', filter.toDate);
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);
    return { items: (data ?? []) as StudentOverviewRow[], total: count ?? 0 };
  }

  async getStudentDetail(studentId: string): Promise<{
    student: StudentOverviewRow;
    subscriptions: Subscription[];
    payments: PaymentQueueRow[];
  }> {
    const [stuRes, subRes, payRes] = await Promise.all([
      this.sb.from('v_students_overview').select('*').eq('id', studentId).single(),
      this.sb
        .from('subscriptions')
        .select('*, tracks(name_ar, stage_id), terms(name_ar)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
      this.sb
        .from('v_payment_queue')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false }),
    ]);
    if (stuRes.error) throw normalizeError(stuRes.error);
    if (subRes.error) throw normalizeError(subRes.error);
    if (payRes.error) throw normalizeError(payRes.error);
    const subscriptions = ((subRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      ...(r as unknown as Subscription),
      track_name: (r.tracks as { name_ar?: string } | null)?.name_ar,
      stage_id: (r.tracks as { stage_id?: string } | null)?.stage_id,
      term_name: (r.terms as { name_ar?: string } | null)?.name_ar,
    }));
    return {
      student: stuRes.data as StudentOverviewRow,
      subscriptions,
      payments: (payRes.data ?? []) as PaymentQueueRow[],
    };
  }

  async getStudentActivity(studentId: string): Promise<{
    progress: StudentItemProgress[];
    quickAnswers: StudentQuickAnswer[];
  }> {
    const [progRes, ansRes] = await Promise.all([
      this.sb
        .from('item_progress')
        .select('student_id, item_id, completed_at, lesson_items(title, lesson_id, lessons(title))')
        .eq('student_id', studentId),
      this.sb
        .from('quick_answers')
        .select(
          'student_id, question_id, selected_option_id, is_correct, answered_at, quick_questions(prompt), quick_question_options(option_text)'
        )
        .eq('student_id', studentId),
    ]);
    if (progRes.error) throw normalizeError(progRes.error);
    if (ansRes.error) throw normalizeError(ansRes.error);

    const progress: StudentItemProgress[] = ((progRes.data ?? []) as Array<Record<string, unknown>>).map(
      (row) => {
        const item = row.lesson_items as {
          title?: string;
          lesson_id?: string;
          lessons?: { title?: string } | null;
        } | null;
        return {
          item_id: String(row.item_id),
          item_title: item?.title ?? String(row.item_id),
          lesson_id: item?.lesson_id ?? '',
          lesson_title: item?.lessons?.title ?? '—',
          completed_at: String(row.completed_at),
        };
      }
    );

    const quickAnswers: StudentQuickAnswer[] = ((ansRes.data ?? []) as Array<Record<string, unknown>>).map(
      (row) => {
        const qq = row.quick_questions as { prompt?: string } | null;
        const opt = row.quick_question_options as { option_text?: string } | null;
        const qId = String(row.question_id);
        return {
          id: qId,
          question_id: qId,
          prompt: qq?.prompt ?? qId,
          selected_option_text: opt?.option_text ?? '—',
          is_correct: Boolean(row.is_correct),
          answered_at: String(row.answered_at),
        };
      }
    );

    return { progress, quickAnswers };
  }

  async getStudentExams(studentId: string): Promise<{
    attempts: ExamAttempt[];
    results: ExamResultRow[];
  }> {
    const [attRes, resRes] = await Promise.all([
      this.sb.from('exam_attempts').select('*').eq('student_id', studentId),
      this.sb.from('exam_results').select('*, exams(title)').eq('student_id', studentId),
    ]);
    if (attRes.error) throw normalizeError(attRes.error);
    if (resRes.error) throw normalizeError(resRes.error);

    const results: ExamResultRow[] = ((resRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      ...(r as unknown as ExamResultRow),
      id: String(r.attempt_id),
      exam_title: (r.exams as { title?: string } | null)?.title,
    }));

    return {
      attempts: (attRes.data ?? []) as ExamAttempt[],
      results,
    };
  }

  async getStudentDevices(studentId: string): Promise<DeviceSession[]> {
    const { data, error } = await this.sb
      .from('device_sessions')
      .select('*')
      .eq('student_id', studentId)
      .order('last_seen_at', { ascending: false });
    return unwrapList(data as DeviceSession[] | null, error);
  }

  async extendTrial(studentId: string, days: number): Promise<void> {
    const { error } = await this.sb.rpc('extend_trial', { p_student_id: studentId, p_days: days });
    if (error) throw normalizeError(error);
  }

  async setStudentBlocked(studentId: string, blocked: boolean, reason?: string): Promise<void> {
    const { error } = await this.sb.rpc('set_student_blocked', {
      p_student_id: studentId,
      p_blocked: blocked,
      p_reason: reason ?? null,
    });
    if (error) throw normalizeError(error);
  }

  async changeStudentTrack(studentId: string, trackId: string): Promise<void> {
    const { error } = await this.sb.rpc('change_student_track', {
      p_student_id: studentId,
      p_track_id: trackId,
    });
    if (error) throw normalizeError(error);
  }

  async updateStudentLocation(
    studentId: string,
    governorateId: string,
    administrationId: string | null
  ): Promise<void> {
    const { error } = await this.sb.rpc('update_student_location', {
      p_student_id: studentId,
      p_governorate_id: governorateId,
      p_administration_id: administrationId,
    });
    if (error) throw normalizeError(error);
  }

  async resetStudentSession(studentId: string): Promise<void> {
    const { error } = await this.sb.rpc('reset_student_session', { p_student_id: studentId });
    if (error) throw normalizeError(error);
  }

  async getExams(filter?: { courseId?: string; termId?: string; status?: string }): Promise<Exam[]> {
    let q = this.sb.from('exams').select('*').order('created_at', { ascending: false });
    if (filter?.courseId) q = q.eq('course_id', filter.courseId);
    if (filter?.termId) q = q.eq('term_id', filter.termId);
    if (filter?.status && filter.status !== 'all') q = q.eq('status', filter.status);
    const { data, error } = await q;
    return unwrapList(data as Exam[] | null, error);
  }

  async getExamDetail(examId: string): Promise<ExamDetailData> {
    const { data: examData, error } = await this.sb.from('exams').select('*').eq('id', examId).single();
    if (error) throw normalizeError(error);
    const exam = examData as Exam;

    const [courseRes, termRes, tcs, tracks, stages, qRes, sRes, resCount] = await Promise.all([
      this.sb.from('courses').select('*').eq('id', exam.course_id).single(),
      this.sb.from('terms').select('*').eq('id', exam.term_id).single(),
      this.getTrackCourses(),
      this.getTracks(),
      this.getStages(),
      this.sb
        .from('exam_questions')
        .select('*, question_options(*)')
        .eq('exam_id', examId)
        .order('position'),
      this.sb.from('exam_sessions').select('*').eq('exam_id', examId).order('starts_at'),
      this.sb.from('exam_results').select('*', { count: 'exact', head: true }).eq('exam_id', examId),
    ]);
    if (courseRes.error) throw normalizeError(courseRes.error);
    if (termRes.error) throw normalizeError(termRes.error);
    if (qRes.error) throw normalizeError(qRes.error);
    if (sRes.error) throw normalizeError(sRes.error);
    if (resCount.error) throw normalizeError(resCount.error);

    const sessions = (sRes.data ?? []) as ExamSession[];
    const sessionIds = sessions.map((s) => s.id);
    let audiences: SessionAudience[] = [];
    if (sessionIds.length > 0) {
      const audRes = await this.sb.from('session_audience').select('*').in('session_id', sessionIds);
      if (audRes.error) throw normalizeError(audRes.error);
      audiences = (audRes.data ?? []) as SessionAudience[];
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
      course: courseRes.data as Course,
      term: termRes.data as Term,
      tracks: linkedTracks,
      questions: (qRes.data ?? []) as ExamQuestion[],
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
      .insert({ ...input, status: 'draft' })
      .select()
      .single();
    return unwrap(data as Exam | null, error);
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
      .update(input)
      .eq('id', examId)
      .select()
      .single();
    return unwrap(data as Exam | null, error);
  }

  async setExamStatus(examId: string, status: 'draft' | 'published' | 'archived'): Promise<Exam> {
    const { data, error } = await this.sb
      .from('exams')
      .update({ status })
      .eq('id', examId)
      .select()
      .single();
    return unwrap(data as Exam | null, error);
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
    let qData: ExamQuestion;

    if (!qId) {
      const { data: maxRow } = await this.sb
        .from('exam_questions')
        .select('position')
        .eq('exam_id', input.exam_id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      const pos = ((maxRow?.position as number | undefined) ?? 0) + 1;
      const { data, error } = await this.sb
        .from('exam_questions')
        .insert({
          exam_id: input.exam_id,
          position: pos,
          question_type: input.question_type,
          prompt_html: sanitizeArticleHtml(input.prompt_html),
          points: input.points,
        })
        .select()
        .single();
      if (error) throw normalizeError(error);
      qData = data as ExamQuestion;
      qId = qData.id;
    } else {
      const { data, error } = await this.sb
        .from('exam_questions')
        .update({
          question_type: input.question_type,
          prompt_html: sanitizeArticleHtml(input.prompt_html),
          points: input.points,
        })
        .eq('id', qId)
        .select()
        .single();
      if (error) throw normalizeError(error);
      qData = data as ExamQuestion;
      await this.sb.from('question_options').delete().eq('question_id', qId);
    }

    if (input.question_type === 'mcq' && input.options.length > 0) {
      const { error: optErr } = await this.sb.from('question_options').insert(
        input.options.map((o, idx) => ({
          question_id: qId,
          option_text: o.option_text,
          is_correct: o.is_correct,
          sort_order: idx + 1,
        }))
      );
      if (optErr) throw normalizeError(optErr);
    }
    return { ...qData, options: [] };
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
    const { data: maxRow } = await this.sb
      .from('exam_questions')
      .select('position')
      .eq('exam_id', examId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    let pos = ((maxRow?.position as number | undefined) ?? 0) + 1;

    const { data: insertedQuestions, error: qErr } = await this.sb
      .from('exam_questions')
      .insert(
        questions.map((q) => ({
          exam_id: examId,
          position: pos++,
          question_type: q.question_type,
          prompt_html: sanitizeArticleHtml(q.prompt_html),
          points: q.points,
        }))
      )
      .select();

    if (qErr) throw normalizeError(qErr);
    const created = (insertedQuestions ?? []) as ExamQuestion[];

    const optionRows: Array<{
      question_id: string;
      option_text: string;
      is_correct: boolean;
      sort_order: number;
    }> = [];

    created.forEach((cq, idx) => {
      const src = questions[idx];
      if (src?.question_type === 'mcq') {
        src.options.forEach((o, oi) => {
          optionRows.push({
            question_id: cq.id,
            option_text: o.option_text,
            is_correct: o.is_correct,
            sort_order: oi + 1,
          });
        });
      }
    });

    if (optionRows.length > 0) {
      const { error: oErr } = await this.sb.from('question_options').insert(optionRows);
      if (oErr) {
        // Compensating rollback
        await this.sb.from('exam_questions').delete().in('id', created.map((c) => c.id));
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
    const { error } = await this.sb.from('exam_questions').upsert(rows, { onConflict: 'id' });
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
      .select()
      .single();
    if (error) throw normalizeError(error);
    const created = sess as ExamSession;
    const { error: aErr } = await this.sb.from('session_audience').insert(
      input.audiences.map((a) => ({ ...a, session_id: created.id }))
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
      .select('*')
      .eq('exam_id', examId);
    return unwrapList(data as ExamSessionStatRow[] | null, error);
  }

  async getQuestionStats(examId: string): Promise<QuestionStatRow[]> {
    const { data, error } = await this.sb.rpc('question_stats', { p_exam_id: examId });
    return unwrapList(data as QuestionStatRow[] | null, error);
  }

  async getGradingBatches(examId: string): Promise<GradingBatch[]> {
    const { data, error } = await this.sb
      .from('grading_batches')
      .select('*')
      .eq('exam_id', examId)
      .order('exported_at', { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []) as GradingBatch[];
  }

  async exportGrading(examId: string): Promise<{ batch: GradingBatch; rows: GradingExportRow[] }> {
    const { data, error } = await this.sb.rpc('export_grading', { p_exam_id: examId });
    if (error) throw normalizeError(error);
    const payload = data as { batch: GradingBatch; rows: GradingExportRow[] };
    return payload;
  }

  async importGrades(batchId: string, rows: GradeImportRow[], aiGraded: boolean): Promise<void> {
    const { error } = await this.sb.rpc('import_grades', {
      p_batch_id: batchId,
      p_rows: rows,
      p_ai_graded: aiGraded,
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
      .select('*, profiles(full_name, phone), exams(title)')
      .eq('exam_id', examId)
      .order('total_score', { ascending: false });
    if (error) throw normalizeError(error);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      ...(r as unknown as ExamResultRow),
      id: String(r.attempt_id),
      exam_title: (r.exams as { title?: string } | null)?.title,
      student_name: (r.profiles as { full_name?: string } | null)?.full_name,
      student_phone: (r.profiles as { phone?: string } | null)?.phone,
    }));
  }

  async listEssayAnswersAdmin(examId: string): Promise<EssayAnswerAdminRow[]> {
    const { data, error } = await this.sb.rpc('list_essay_answers', { p_exam_id: examId });
    return unwrapList(data as EssayAnswerAdminRow[] | null, error);
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
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw normalizeError(error);
    const raw = (data ?? []) as Announcement[];

    const [tracks, govs] = await Promise.all([
      raw.some((a) => a.track_id) ? this.getTracks() : Promise.resolve([]),
      raw.some((a) => a.governorate_id) ? this.getGovernorates() : Promise.resolve([]),
    ]);
    const trackMap = new Map(tracks.map((t) => [t.id, t.name_ar]));
    const govMap = new Map(govs.map((g) => [g.id, g.name_ar]));

    const items = raw.map((a) => ({
      ...a,
      track_name: a.track_id ? (trackMap.get(a.track_id) ?? null) : null,
      governorate_name: a.governorate_id ? (govMap.get(a.governorate_id) ?? null) : null,
    }));
    return { items, total: count ?? 0 };
  }

  async countAnnouncementRecipients(
    trackId: string | null,
    governorateId: string | null
  ): Promise<number> {
    let q = this.sb.from('profiles').select('*', { count: 'exact', head: true }).eq('is_blocked', false);
    if (trackId) q = q.eq('track_id', trackId);
    if (governorateId) q = q.eq('governorate_id', governorateId);
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
      p_track_id: input.track_id,
      p_governorate_id: input.governorate_id,
    });
    return unwrap(data as Announcement | null, error);
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
        this.sb.from('exam_results').select('*, profiles(full_name, phone), exams(title)').limit(1000),
        this.sb.from('item_progress').select('*', { count: 'exact', head: true }),
        this.sb.from('quick_answers').select('*', { count: 'exact', head: true }),
        this.sb.from('quick_answers').select('*', { count: 'exact', head: true }).eq('is_correct', true),
      ]);
    if (resRes.error) throw normalizeError(resRes.error);

    const results: ExamResultRow[] = ((resRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      ...(r as unknown as ExamResultRow),
      id: String(r.attempt_id),
      exam_title: (r.exams as { title?: string } | null)?.title,
      student_name: (r.profiles as { full_name?: string } | null)?.full_name,
      student_phone: (r.profiles as { phone?: string } | null)?.phone,
    }));

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
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (filter.action) q = q.eq('action', filter.action);
    if (filter.entityType) q = q.eq('entity_type', filter.entityType);
    if (filter.actorId) q = q.eq('actor_id', filter.actorId);
    if (filter.fromDate) q = q.gte('created_at', filter.fromDate);
    if (filter.toDate) q = q.lte('created_at', filter.toDate);
    const { data, count, error } = await q.range(from, to);
    if (error) throw normalizeError(error);

    const raw = (data ?? []) as Array<{
      id: number | string;
      actor_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      details: Record<string, unknown>;
      created_at: string;
    }>;
    const actorIds = Array.from(new Set(raw.map((r) => r.actor_id).filter(Boolean)));
    const actorNameMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: staffRows } = await this.sb
        .from('staff_profiles')
        .select('user_id, full_name')
        .in('user_id', actorIds);
      for (const s of (staffRows ?? []) as Array<{ user_id: string; full_name: string }>) {
        actorNameMap.set(s.user_id, s.full_name);
      }
    }

    const items: AuditLogEntry[] = raw.map((r) => ({
      id: String(r.id),
      actor_id: r.actor_id,
      actor_name: actorNameMap.get(r.actor_id) ?? r.actor_id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      details: r.details ?? {},
      created_at: r.created_at,
    }));
    return { items, total: count ?? 0 };
  }

  async getYearEndReports(): Promise<YearEndReport[]> {
    const { data, error } = await this.sb
      .from('year_end_reports')
      .select('*')
      .order('registered_at', { ascending: false });
    return unwrapList(data as YearEndReport[] | null, error);
  }

  async registerYearEndReport(academicYear: string, pdfPath: string): Promise<YearEndReport> {
    const { data, error } = await this.sb.rpc('register_year_end_report', {
      p_academic_year: academicYear,
      p_pdf_path: pdfPath,
    });
    return unwrap(data as YearEndReport | null, error);
  }

  async purgeYearEndDetails(academicYear: string, confirmation: string): Promise<number> {
    const { data, error } = await this.sb.rpc('purge_year_end_details', {
      p_academic_year: academicYear,
      p_confirmation: confirmation,
    });
    return unwrap(data as number | null, error);
  }
}
