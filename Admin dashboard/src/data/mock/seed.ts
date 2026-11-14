import type {
  Administration,
  AllowedLinkDomain,
  Announcement,
  AuditLogEntry,
  Course,
  DeviceSession,
  Exam,
  ExamAttempt,
  ExamQuestion,
  ExamResultRow,
  ExamSession,
  Governorate,
  GradingBatch,
  Lesson,
  LessonItem,
  PaymentStatus,
  Plan,
  SessionAudience,
  StaffProfile,
  Stage,
  StudentItemProgress,
  StudentQuickAnswer,
  Subscription,
  Term,
  Track,
  TrackCourse,
  YearEndReport,
} from '../types';

export interface MockStudentRecord {
  id: string;
  full_name: string;
  phone: string;
  guardian_phone: string | null;
  governorate_id: string;
  administration_id: string | null;
  track_id: string;
  trial_ends_at: string;
  is_blocked: boolean;
  block_reason: string | null;
  created_at: string;
}

export interface MockPaymentRequestRecord {
  id: string;
  student_id: string;
  track_id: string;
  term_id: string;
  amount_egp: number;
  sender_phone: string;
  proof_path: string | null;
  status: PaymentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
}

export interface MockEssayAnswerRecord {
  answer_id: string;
  attempt_id: string;
  exam_id: string;
  question_id: string;
  answer_code: string;
  answer_text: string;
  score: number | null;
  adjust_reason: string | null;
}

export interface MockAttemptAnswerMcq {
  attempt_id: string;
  question_id: string;
  selected_option_id: string | null;
  is_correct: boolean;
}

export interface MockDatabase {
  staff: StaffProfile[];
  governorates: Governorate[];
  administrations: Administration[];
  stages: Stage[];
  tracks: Track[];
  courses: Course[];
  trackCourses: TrackCourse[];
  terms: Term[];
  allowedDomains: AllowedLinkDomain[];
  lessons: Lesson[];
  lessonItems: LessonItem[];
  plans: Plan[];
  subscriptions: Subscription[];
  paymentRequests: MockPaymentRequestRecord[];
  students: MockStudentRecord[];
  deviceSessions: DeviceSession[];
  itemProgress: Array<StudentItemProgress & { student_id: string }>;
  quickAnswers: Array<StudentQuickAnswer & { student_id: string; item_id: string }>;
  exams: Exam[];
  examQuestions: ExamQuestion[];
  examSessions: ExamSession[];
  sessionAudiences: SessionAudience[];
  examAttempts: ExamAttempt[];
  essayAnswers: MockEssayAnswerRecord[];
  mcqAnswers: MockAttemptAnswerMcq[];
  gradingBatches: GradingBatch[];
  examResults: ExamResultRow[];
  announcements: Announcement[];
  auditLog: AuditLogEntry[];
  yearEndReports: YearEndReport[];
  mediaFiles: Record<string, string>;
}

const EGYPT_GOVERNORATES: string[] = [
  'القاهرة',
  'الجيزة',
  'الإسكندرية',
  'الدقهلية',
  'البحر الأحمر',
  'البحيرة',
  'الفيوم',
  'الغربية',
  'الإسماعيلية',
  'المنوفية',
  'المنيا',
  'القليوبية',
  'الوادي الجديد',
  'السويس',
  'أسوان',
  'أسيوط',
  'بني سويف',
  'بورسعيد',
  'دمياط',
  'الشرقية',
  'جنوب سيناء',
  'كفر الشيخ',
  'مطروح',
  'الأقصر',
  'قنا',
  'شمال سيناء',
  'سوهاج',
];

function addDaysIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function addHoursIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function createInitialMockDatabase(): MockDatabase {
  const governorates: Governorate[] = EGYPT_GOVERNORATES.map((name, idx) => ({
    id: `gov-${idx + 1}`,
    name_ar: name,
    sort_order: idx + 1,
  }));

  const administrations: Administration[] = [
    { id: 'adm-1', governorate_id: 'gov-1', name_ar: 'مدينة نصر شرق', is_active: true },
    { id: 'adm-2', governorate_id: 'gov-1', name_ar: 'مصر الجديدة', is_active: true },
    { id: 'adm-3', governorate_id: 'gov-1', name_ar: 'المعادي', is_active: true },
    { id: 'adm-4', governorate_id: 'gov-2', name_ar: 'الدقي', is_active: true },
    { id: 'adm-5', governorate_id: 'gov-2', name_ar: 'العمرانية', is_active: true },
    { id: 'adm-6', governorate_id: 'gov-2', name_ar: 'الشيخ زايد', is_active: true },
    { id: 'adm-7', governorate_id: 'gov-3', name_ar: 'المنتزه', is_active: true },
  ];

  const stages: Stage[] = [
    { id: 'stage-3', name_ar: 'الصف الثالث الثانوي', sort_order: 1 },
  ];

  const tracks: Track[] = [
    { id: 'track-sci', stage_id: 'stage-3', name_ar: 'علمي علوم', is_active: true, sort_order: 1 },
    { id: 'track-math', stage_id: 'stage-3', name_ar: 'علمي رياضة', is_active: true, sort_order: 2 },
    { id: 'track-lit', stage_id: 'stage-3', name_ar: 'أدبي', is_active: true, sort_order: 3 },
  ];

  const courses: Course[] = [
    { id: 'course-phys', name_ar: 'الفيزياء', icon_key: 'atom', sort_order: 1, is_active: true },
    { id: 'course-chem', name_ar: 'الكيمياء', icon_key: 'flask', sort_order: 2, is_active: true },
    { id: 'course-ar', name_ar: 'اللغة العربية', icon_key: 'book', sort_order: 3, is_active: true },
  ];

  const trackCourses: TrackCourse[] = [
    { track_id: 'track-sci', course_id: 'course-phys', sort_order: 1 },
    { track_id: 'track-sci', course_id: 'course-chem', sort_order: 2 },
    { track_id: 'track-sci', course_id: 'course-ar', sort_order: 3 },
    { track_id: 'track-math', course_id: 'course-phys', sort_order: 1 },
    { track_id: 'track-math', course_id: 'course-ar', sort_order: 2 },
    { track_id: 'track-lit', course_id: 'course-ar', sort_order: 1 },
  ];

  const terms: Term[] = [
    {
      id: 'term-1',
      name_ar: 'الترم الأول',
      sort_order: 1,
      access_ends_at: addDaysIso(120),
    },
    {
      id: 'term-2',
      name_ar: 'الترم الثاني',
      sort_order: 2,
      access_ends_at: null, // Intentionally unset to demonstrate alert banner (B8/E6)
    },
  ];

  const allowedDomains: AllowedLinkDomain[] = [
    { id: 'dom-1', domain: 'youtube.com', kind: 'video', is_active: true },
    { id: 'dom-2', domain: 'youtu.be', kind: 'video', is_active: true },
    { id: 'dom-3', domain: 'drive.google.com', kind: 'document', is_active: true },
    { id: 'dom-4', domain: 'docs.google.com', kind: 'document', is_active: true },
  ];

  const plans: Plan[] = [
    {
      id: 'plan-1',
      track_id: 'track-sci',
      term_id: 'term-1',
      price_egp: 300,
      is_active: true,
      created_at: addDaysIso(-30),
    },
    {
      id: 'plan-2',
      track_id: 'track-lit',
      term_id: 'term-1',
      price_egp: 250,
      is_active: true,
      created_at: addDaysIso(-30),
    },
  ];

  const staff: StaffProfile[] = [
    {
      id: 'staff-admin',
      email: 'admin@thanawya.edu.eg',
      full_name: 'أحمد محمود (المدير العام)',
      is_active: true,
      created_at: addDaysIso(-90),
      roles: ['admin'],
    },
    {
      id: 'staff-content',
      email: 'content@thanawya.edu.eg',
      full_name: 'سارة علي (المحتوى)',
      is_active: true,
      created_at: addDaysIso(-60),
      roles: ['content'],
    },
    {
      id: 'staff-pay',
      email: 'pay@thanawya.edu.eg',
      full_name: 'كريم حسن (مراجع المدفوعات)',
      is_active: true,
      created_at: addDaysIso(-60),
      roles: ['payments_reviewer'],
    },
    {
      id: 'staff-exams',
      email: 'exams@thanawya.edu.eg',
      full_name: 'منى طارق (الامتحانات)',
      is_active: true,
      created_at: addDaysIso(-60),
      roles: ['exams'],
    },
    {
      id: 'staff-grader',
      email: 'grader@thanawya.edu.eg',
      full_name: 'عمر خالد (مصحح)',
      is_active: true,
      created_at: addDaysIso(-60),
      roles: ['grader'],
    },
    {
      id: 'staff-mgr',
      email: 'mgr@thanawya.edu.eg',
      full_name: 'هدى إبراهيم (شؤون الطلاب)',
      is_active: true,
      created_at: addDaysIso(-60),
      roles: ['students_manager'],
    },
    {
      id: 'staff-support',
      email: 'support@thanawya.edu.eg',
      full_name: 'يوسف سامي (الدعم الفني)',
      is_active: true,
      created_at: addDaysIso(-60),
      roles: ['support'],
    },
  ];

  const students: MockStudentRecord[] = [
    {
      id: 'stu-1',
      full_name: 'ياسين محمد عبد الله',
      phone: '01011223344',
      guardian_phone: '01099887766',
      governorate_id: 'gov-2', // الجيزة
      administration_id: 'adm-4', // الدقي
      track_id: 'track-sci',
      trial_ends_at: addDaysIso(15),
      is_blocked: false,
      block_reason: null,
      created_at: addDaysIso(-15),
    },
    {
      id: 'stu-2',
      full_name: 'مريم طارق السيد',
      phone: '01122334455',
      guardian_phone: '01188776655',
      governorate_id: 'gov-2', // الجيزة
      administration_id: 'adm-5', // العمرانية
      track_id: 'track-sci',
      trial_ends_at: addDaysIso(4),
      is_blocked: false,
      block_reason: null,
      created_at: addDaysIso(-26),
    },
    {
      id: 'stu-3',
      full_name: 'عمر أشرف فؤاد',
      phone: '01233445566',
      guardian_phone: null,
      governorate_id: 'gov-1', // القاهرة
      administration_id: 'adm-1', // مدينة نصر شرق
      track_id: 'track-sci',
      trial_ends_at: addDaysIso(20),
      is_blocked: false,
      block_reason: null,
      created_at: addDaysIso(-10),
    },
    {
      id: 'stu-4',
      full_name: 'نور الهدى مصطفى',
      phone: '01544556677',
      guardian_phone: '01012345678',
      governorate_id: 'gov-2', // الجيزة
      administration_id: 'adm-4',
      track_id: 'track-lit',
      trial_ends_at: addDaysIso(12),
      is_blocked: false,
      block_reason: null,
      created_at: addDaysIso(-18),
    },
    {
      id: 'stu-5',
      full_name: 'زياد حسن عبد الرحمن',
      phone: '01055667788',
      guardian_phone: '01299887711',
      governorate_id: 'gov-1',
      administration_id: 'adm-2',
      track_id: 'track-sci',
      trial_ends_at: addDaysIso(-5), // Expired trial
      is_blocked: false,
      block_reason: null,
      created_at: addDaysIso(-35),
    },
    {
      id: 'stu-6',
      full_name: 'حسام الدين علي',
      phone: '01166778899',
      guardian_phone: null,
      governorate_id: 'gov-3',
      administration_id: 'adm-7',
      track_id: 'track-lit',
      trial_ends_at: addDaysIso(10),
      is_blocked: true,
      block_reason: 'مخالفة شروط مشاركة الحساب على أكثر من جهاز',
      created_at: addDaysIso(-20),
    },
  ];

  const deviceSessions: DeviceSession[] = [
    {
      id: 'dev-1',
      student_id: 'stu-1',
      device_id: 'android-98234-a1',
      device_label: 'Samsung Galaxy A54',
      platform: 'android',
      is_active: true,
      last_seen_at: addHoursIso(-1),
      created_at: addDaysIso(-15),
    },
    {
      id: 'dev-2',
      student_id: 'stu-2',
      device_id: 'android-77122-b4',
      device_label: 'Xiaomi Redmi Note 12',
      platform: 'android',
      is_active: true,
      last_seen_at: addHoursIso(-4),
      created_at: addDaysIso(-26),
    },
  ];

  const paymentRequests: MockPaymentRequestRecord[] = [
    {
      id: 'pay-1',
      student_id: 'stu-5',
      track_id: 'track-sci',
      term_id: 'term-1',
      amount_egp: 300,
      sender_phone: '01055667788',
      proof_path: 'proofs/stu-5-receipt.svg',
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      reject_reason: null,
      created_at: addDaysIso(-2),
    },
    {
      id: 'pay-2',
      student_id: 'stu-2',
      track_id: 'track-sci',
      term_id: 'term-1',
      amount_egp: 300,
      sender_phone: '01122334400',
      proof_path: null, // No proof image case (E3)
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      reject_reason: null,
      created_at: addDaysIso(-1),
    },
    {
      id: 'pay-3',
      student_id: 'stu-1',
      track_id: 'track-sci',
      term_id: 'term-1',
      amount_egp: 300,
      sender_phone: '01011223344',
      proof_path: 'proofs/stu-1-receipt.svg',
      status: 'approved',
      reviewed_by: 'staff-pay',
      reviewed_at: addDaysIso(-5),
      reject_reason: null,
      created_at: addDaysIso(-6),
    },
  ];

  const subscriptions: Subscription[] = [
    {
      id: 'sub-1',
      student_id: 'stu-1',
      track_id: 'track-sci',
      term_id: 'term-1',
      price_paid_egp: 300,
      starts_at: addDaysIso(-5),
      ends_at: addDaysIso(120),
      status: 'active',
      payment_request_id: 'pay-3',
      granted_by: null,
      grant_note: null,
      created_at: addDaysIso(-5),
    },
  ];

  const lessons: Lesson[] = [
    {
      id: 'lesson-1',
      course_id: 'course-phys',
      term_id: 'term-1',
      title: 'التيار الكهربي وقانون أوم',
      summary: 'مقدمة شاملة لشدة التيار وفرق الجهد والمقاومة الكهربية.',
      sort_order: 1,
      status: 'published',
      published_at: addDaysIso(-12),
      created_at: addDaysIso(-14),
      updated_at: addDaysIso(-12),
    },
    {
      id: 'lesson-2',
      course_id: 'course-phys',
      term_id: 'term-1',
      title: 'توصيل المقاومات على التوالي والتوازي',
      summary: 'حساب المقاومة المكافئة وتوزيع التيار والجهد.',
      sort_order: 2,
      status: 'draft',
      published_at: null,
      created_at: addDaysIso(-4),
      updated_at: addDaysIso(-4),
    },
    {
      id: 'lesson-3',
      course_id: 'course-ar',
      term_id: 'term-1',
      title: 'أسلوب الاستثناء وإعراب المستثنى',
      summary: 'شرح حالات المستثنى بإلا وغير وسوى وعدا وخلا وحاشا.',
      sort_order: 1,
      status: 'published',
      published_at: addDaysIso(-8),
      created_at: addDaysIso(-9),
      updated_at: addDaysIso(-8),
    },
  ];

  const lessonItems: LessonItem[] = [
    {
      id: 'item-1',
      lesson_id: 'lesson-1',
      item_type: 'article',
      title: 'ملخص القوانين الأساسية للتيار الكهربي',
      sort_order: 1,
      body_json: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'شدة التيار الكهربي (I)' }] },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'تُقاس شدة التيار بوحدة الأمبير وتساوي كمية الشحنة المارة في الثانية الواحدة.' }],
          },
        ],
      },
      body_html:
        '<h2>شدة التيار الكهربي (I)</h2><p>تُقاس شدة التيار بوحدة الأمبير وتساوي كمية الشحنة المارة في الثانية الواحدة.</p>',
      url: null,
      link_kind: null,
      android_only: false,
    },
    {
      id: 'item-2',
      lesson_id: 'lesson-1',
      item_type: 'link',
      title: 'فيديو الشرح التطبيقي لقانون أوم',
      sort_order: 2,
      body_json: null,
      body_html: null,
      url: 'https://www.youtube.com/watch?v=ohm_law_demo',
      link_kind: 'video',
      android_only: true,
    },
    {
      id: 'item-3',
      lesson_id: 'lesson-1',
      item_type: 'quick_questions',
      title: 'اختبار سريع على الدرس الأول',
      sort_order: 3,
      body_json: null,
      body_html: null,
      url: null,
      link_kind: null,
      android_only: false,
      quick_questions: [
        {
          id: 'qq-1',
          item_id: 'item-3',
          prompt: 'وحدة قياس المقاومة الكهربية هي:',
          explanation: 'تقاس المقاومة بالأوم تكريمًا للعالم جورج أوم.',
          sort_order: 1,
          options: [
            { id: 'qqo-1', question_id: 'qq-1', option_text: 'الأمبير', is_correct: false, sort_order: 1 },
            { id: 'qqo-2', question_id: 'qq-1', option_text: 'الأوم', is_correct: true, sort_order: 2 },
            { id: 'qqo-3', question_id: 'qq-1', option_text: 'الفولت', is_correct: false, sort_order: 3 },
          ],
        },
      ],
    },
    {
      id: 'item-4',
      lesson_id: 'lesson-3',
      item_type: 'link',
      title: 'ملزمة تدريبات النحو (Google Drive)',
      sort_order: 1,
      body_json: null,
      body_html: null,
      url: 'https://drive.google.com/file/d/arabic_demo/view',
      link_kind: 'document',
      android_only: false,
    },
  ];

  const itemProgress = [
    {
      student_id: 'stu-1',
      item_id: 'item-1',
      item_title: 'ملخص القوانين الأساسية للتيار الكهربي',
      lesson_id: 'lesson-1',
      lesson_title: 'التيار الكهربي وقانون أوم',
      completed_at: addDaysIso(-3),
    },
  ];

  const quickAnswers = [
    {
      id: 'qa-1',
      student_id: 'stu-1',
      item_id: 'item-3',
      question_id: 'qq-1',
      prompt: 'وحدة قياس المقاومة الكهربية هي:',
      selected_option_text: 'الأوم',
      is_correct: true,
      answered_at: addDaysIso(-3),
    },
  ];

  // Exams: 1) Upcoming published exam with 2 sessions (Giza & Cairo); 2) Ended exam ready for grading
  const exams: Exam[] = [
    {
      id: 'exam-1',
      course_id: 'course-phys',
      term_id: 'term-1',
      title: 'امتحان الوحدة الأولى: التيار الكهربي',
      description: 'امتحان شامل على الفصل الأول يشمل أسئلة اختيار من متعدد ومقالي.',
      duration_minutes: 60,
      late_entry_minutes: 30,
      disconnect_grace_seconds: 300,
      status: 'published',
      created_at: addDaysIso(-7),
      updated_at: addDaysIso(-5),
    },
    {
      id: 'exam-2',
      course_id: 'course-chem',
      term_id: 'term-1',
      title: 'اختبار العناصر الانتقالية (مكتمل وجاهز للتصحيح)',
      description: 'اختبار نهاية الشهر الأول في الكيمياء.',
      duration_minutes: 45,
      late_entry_minutes: 15,
      disconnect_grace_seconds: 300,
      status: 'published',
      created_at: addDaysIso(-14),
      updated_at: addDaysIso(-10),
    },
  ];

  const examQuestions: ExamQuestion[] = [
    {
      id: 'eq-1',
      exam_id: 'exam-1',
      position: 1,
      question_type: 'mcq',
      prompt_html: '<p>إذا زاد طول موصل للضعف مع ثبوت مساحته فإن مقاومته:</p>',
      points: 2,
      options: [
        { id: 'eqo-1', question_id: 'eq-1', option_text: 'تزداد للضعف', is_correct: true, sort_order: 1 },
        { id: 'eqo-2', question_id: 'eq-1', option_text: 'تقل للنصف', is_correct: false, sort_order: 2 },
        { id: 'eqo-3', question_id: 'eq-1', option_text: 'تظل ثابتة', is_correct: false, sort_order: 3 },
      ],
    },
    {
      id: 'eq-2',
      exam_id: 'exam-1',
      position: 2,
      question_type: 'essay',
      prompt_html: '<p>فسر لماذا تزداد مقاومة الموصل الفلزي بارتفاع درجة الحرارة.</p>',
      points: 5,
      options: [],
    },
    {
      id: 'eq-3',
      exam_id: 'exam-2',
      position: 1,
      question_type: 'mcq',
      prompt_html: '<p>العنصر الذي يمتلك أعلى حالة تأكسد في السلسلة الانتقالية الأولى هو:</p>',
      points: 2,
      options: [
        { id: 'eqo-4', question_id: 'eq-3', option_text: 'الحديد', is_correct: false, sort_order: 1 },
        { id: 'eqo-5', question_id: 'eq-3', option_text: 'المنجنيز', is_correct: true, sort_order: 2 },
        { id: 'eqo-6', question_id: 'eq-3', option_text: 'النحاس', is_correct: false, sort_order: 3 },
      ],
    },
    {
      id: 'eq-4',
      exam_id: 'exam-2',
      position: 2,
      question_type: 'essay',
      prompt_html: '<p>اذكر استخدامين لأكاسيد الفاناديوم في الصناعة.</p>',
      points: 5,
      options: [],
    },
  ];

  const examSessions: ExamSession[] = [
    {
      id: 'sess-1',
      exam_id: 'exam-1',
      name: 'فترة الجيزة المسائية',
      starts_at: addHoursIso(6),
      ends_at: addHoursIso(7),
    },
    {
      id: 'sess-2',
      exam_id: 'exam-1',
      name: 'فترة القاهرة والمحافظات',
      starts_at: addHoursIso(10),
      ends_at: addHoursIso(11),
    },
    {
      id: 'sess-3',
      exam_id: 'exam-2',
      name: 'الجلسة الموحدة (منتهية)',
      starts_at: addDaysIso(-3),
      ends_at: addDaysIso(-3),
    },
  ];

  const sessionAudiences: SessionAudience[] = [
    { id: 'aud-1', session_id: 'sess-1', governorate_id: 'gov-2', administration_id: null, track_id: null },
    { id: 'aud-2', session_id: 'sess-2', governorate_id: 'gov-1', administration_id: null, track_id: null },
    { id: 'aud-3', session_id: 'sess-3', governorate_id: null, administration_id: null, track_id: 'track-sci' },
  ];

  const examAttempts: ExamAttempt[] = [
    {
      id: 'att-1',
      exam_id: 'exam-2',
      session_id: 'sess-3',
      student_id: 'stu-1',
      status: 'submitted',
      started_at: addDaysIso(-3),
      submitted_at: addDaysIso(-3),
    },
    {
      id: 'att-2',
      exam_id: 'exam-2',
      session_id: 'sess-3',
      student_id: 'stu-2',
      status: 'auto_submitted',
      started_at: addDaysIso(-3),
      submitted_at: addDaysIso(-3),
    },
  ];

  const mcqAnswers: MockAttemptAnswerMcq[] = [
    { attempt_id: 'att-1', question_id: 'eq-3', selected_option_id: 'eqo-5', is_correct: true },
    { attempt_id: 'att-2', question_id: 'eq-3', selected_option_id: 'eqo-4', is_correct: false },
  ];

  const essayAnswers: MockEssayAnswerRecord[] = [
    {
      answer_id: 'ans-1',
      attempt_id: 'att-1',
      exam_id: 'exam-2',
      question_id: 'eq-4',
      answer_code: 'CHEM-1001',
      answer_text: 'يستخدم خامس أكسيد الفاناديوم كعامل حفاز في صناعة حمض الكبريتيك وفي صناعة المغناطيسات فائقة التوصيل.',
      score: null,
      adjust_reason: null,
    },
    {
      answer_id: 'ans-2',
      attempt_id: 'att-2',
      exam_id: 'exam-2',
      question_id: 'eq-4',
      answer_code: 'CHEM-1002',
      answer_text: 'يستخدم في صناعة السيراميك والزجاج كصبغة وعامل حفاز.',
      score: null,
      adjust_reason: null,
    },
  ];

  const announcements: Announcement[] = [
    {
      id: 'ann-1',
      title: 'افتتاح المراجعة الأسبوعية لمادة الفيزياء',
      body: 'تم نشر الدرس الأول في الفيزياء مع فيديو الشرح والاختبار السريع لطلاب الشعبة العلمية.',
      track_id: 'track-sci',
      governorate_id: null,
      recipients_count: 4,
      sent_by: 'staff-mgr',
      created_at: addDaysIso(-4),
    },
  ];

  const auditLog: AuditLogEntry[] = [
    {
      id: 'audlog-1',
      actor_id: 'staff-pay',
      actor_name: 'كريم حسن (مراجع المدفوعات)',
      action: 'approve_payment',
      entity_type: 'payment_request',
      entity_id: 'pay-3',
      details: { student_id: 'stu-1', amount_egp: 300 },
      created_at: addDaysIso(-5),
    },
    {
      id: 'audlog-2',
      actor_id: 'staff-mgr',
      actor_name: 'هدى إبراهيم (شؤون الطلاب)',
      action: 'set_student_blocked',
      entity_type: 'profile',
      entity_id: 'stu-6',
      details: { blocked: true },
      created_at: addDaysIso(-6),
    },
  ];

  return {
    staff,
    governorates,
    administrations,
    stages,
    tracks,
    courses,
    trackCourses,
    terms,
    allowedDomains,
    lessons,
    lessonItems,
    plans,
    subscriptions,
    paymentRequests,
    students,
    deviceSessions,
    itemProgress,
    quickAnswers,
    exams,
    examQuestions,
    examSessions,
    sessionAudiences,
    examAttempts,
    essayAnswers,
    mcqAnswers,
    gradingBatches: [],
    examResults: [],
    announcements,
    auditLog,
    yearEndReports: [],
    mediaFiles: {},
  };
}
