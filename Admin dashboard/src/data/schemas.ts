import { z } from 'zod';

export const egyptPhoneSchema = z
  .string()
  .trim()
  .regex(/^01[0125][0-9]{8}$/, 'رقم الموبايل يجب أن يكون 11 رقمًا يبدأ بـ 010 أو 011 أو 012 أو 015');

export const stageSchema = z.object({
  name_ar: z.string().trim().min(2, 'الاسم مطلوب (حرفان على الأقل)').max(100),
  sort_order: z.number().int().min(1),
});

export const trackSchema = z.object({
  stage_id: z.string().min(1, 'الصف الدراسي مطلوب'),
  name_ar: z.string().trim().min(2, 'اسم المسار مطلوب').max(100),
  is_active: z.boolean(),
  sort_order: z.number().int().min(1),
});

export const courseSchema = z.object({
  name_ar: z.string().trim().min(2, 'اسم المادة مطلوب').max(100),
  icon_key: z.enum([
    'atom',
    'flask',
    'book',
    'calculator',
    'globe',
    'dna',
    'scroll',
    'languages',
    'compass',
    'cpu',
  ]),
  sort_order: z.number().int().min(1),
  is_active: z.boolean(),
});

export const termSchema = z.object({
  name_ar: z.string().trim().min(2, 'اسم الترم مطلوب').max(100),
  sort_order: z.number().int().min(1),
  access_ends_at: z.string().nullable(),
});

export const allowedDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'النطاق مطلوب')
    .refine(
      (v) => !v.includes('://') && !v.includes('/') && v.includes('.'),
      'أدخل النطاق فقط بأحرف صغيرة بدون https:// أو مسار (مثال: youtube.com)'
    ),
  kind: z.enum(['video', 'document']),
  is_active: z.boolean(),
});

export const lessonCreateSchema = z.object({
  stage_id: z.string().min(1, 'الصف الدراسي مطلوب'),
  track_id: z.string().min(1, 'المسار / الشعبة مطلوب'),
  course_id: z.string().min(1, 'المادة مطلوبة'),
  term_id: z.string().min(1, 'الترم مطلوب'),
  title: z.string().trim().min(2, 'العنوان من 2 إلى 200 حرف').max(200),
  summary: z.string().trim().max(1000, 'الملخص بحد أقصى 1000 حرف').optional(),
});

export const lessonUpdateMetaSchema = z.object({
  title: z.string().trim().min(2, 'العنوان من 2 إلى 200 حرف').max(200),
  summary: z.string().trim().max(1000, 'الملخص بحد أقصى 1000 حرف').nullable(),
});

export const lessonItemBaseSchema = z.object({
  title: z.string().trim().min(1, 'عنوان العنصر مطلوب').max(200),
});

export const linkUrlSchema = z
  .string()
  .trim()
  .url('رابط غير صالح')
  .refine((u) => u.startsWith('https://'), 'يجب أن يبدأ الرابط ببروتوكول https://');

export const planSchema = z.object({
  track_id: z.string().min(1),
  term_id: z.string().min(1),
  price_egp: z.number().positive('السعر يجب أن يكون أكبر من صفر'),
  is_active: z.boolean(),
});

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(1, 'سبب الرفض مطلوب').max(500),
});

export const extendTrialSchema = z.object({
  days: z.number().int().min(1, 'الحد الأدنى يوم واحد').max(365, 'الحد الأقصى 365 يومًا'),
});

export const grantSubscriptionSchema = z.object({
  term_id: z.string().min(1, 'الترم مطلوب'),
  ends_at: z.string().min(1, 'تاريخ الانتهاء مطلوب'),
  note: z.string().trim().max(300).optional(),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(2, 'العنوان من 2 إلى 120 حرفًا').max(120),
  body: z.string().trim().min(2, 'النص من 2 إلى 1000 حرف').max(1000),
  track_id: z.string().nullable(),
  governorate_id: z.string().nullable(),
});

export const examBasicsSchema = z.object({
  stage_id: z.string().min(1, 'الصف الدراسي مطلوب'),
  track_id: z.string().min(1, 'المسار مطلوب'),
  course_id: z.string().min(1, 'المادة مطلوبة'),
  term_id: z.string().min(1, 'الترم مطلوب'),
  title: z.string().trim().min(2, 'عنوان الامتحان مطلوب').max(200),
  description: z.string().trim().max(1000).optional(),
  duration_minutes: z.number().int().min(5, 'المدة من 5 إلى 300 دقيقة').max(300),
  late_entry_minutes: z.number().int().min(0).max(60),
  disconnect_grace_seconds: z.number().int().min(30).max(1800),
});

export const adjustEssayGradeSchema = z.object({
  score: z.number().min(0, 'الدرجة لا تكون سالبة'),
  reason: z.string().trim().min(3, 'سبب التعديل 3 أحرف على الأقل').max(500),
});

export const yearEndRegisterSchema = z.object({
  academic_year: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, 'صيغة العام الدراسي مثل 2025-2026'),
  pdf_path: z.string().trim().min(3, 'مسار ملف PDF مطلوب'),
});

export const createStaffSchema = z.object({
  email: z.string().trim().email('بريد إلكتروني غير صالح'),
  full_name: z.string().trim().min(2, 'الاسم الكامل مطلوب').max(120),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
  roles: z
    .array(
      z.enum([
        'admin',
        'students_manager',
        'payments_reviewer',
        'support',
        'content',
        'exams',
        'grader',
      ])
    )
    .min(1, 'اختر دورًا واحدًا على الأقل'),
});
