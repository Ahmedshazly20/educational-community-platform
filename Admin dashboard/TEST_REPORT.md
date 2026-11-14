# TEST_REPORT — تقرير الاختبارات والتحقق

## 1. ملخص التنفيذ
- **اختبارات الوحدات ومحاكاة قاعدة البيانات (`npx --yes tsx --test src/lib/*.test.ts src/data/mock/mockAdapter.test.ts`)**: **21 / 21 نجاح** (0 فشل).
- **فحص TypeScript (`npm run lint` / `tsc --noEmit`)**: **نجاح** بدون أخطاء.
- **البناء الإنتاجي (`npm run build` / `vite build`)**: **نجاح** بدون أخطاء.
- **التحقق التفاعلي في متصفح Chromium عبر `playwright-cli`**:
  - الجولة الأولى: تسجيل الدخول و TOTP MFA (`123456`)، فحص لوحة التحكم وتنبيه `terms.access_ends_at`، التنقل عبر جميع المسارات الستة عشر دون أي أخطاء Console/PageError، اختبار عزل صلاحيات دور `grader` وتوجيه `/unauthorized`. تم اكتشاف فتح القائمة الجانبية افتراضيًا على الهاتف وإلتفاف أزرار جدول الدروس وتم إصلاحهما.
  - الجولة الثانية: إعادة التحقق على شاشة الهاتف (`375×812`) وشاشة سطح المكتب (`1440×900`) — فتح متصفح المحتوى، محرر الدروس، درج مراجعة المدفوعات مع صورة الإيصال، وصفحة التصحيح والنتائج مع صفر أخطاء تشغيلية.
- **الاختبارات التعاقدية مع Supabase الفعلي (`@supabase/supabase-js` على Docker المحلي)**: تم تخطيها لعدم توفر خادم Supabase محلي / Docker في بيئة التشغيل الحالية؛ تم استبدال التحقق السلوكي باختبارات `src/data/mock/mockAdapter.test.ts` التي تحاكي قيود PostgreSQL و RLS والقواعد التجارية.

## 2. مصفوفة تغطية سيناريوهات القبول (A1 – L7)
| المعرّف | السيناريو | آلية التحقق | الحالة |
| --- | --- | --- | --- |
| A1–A6 | المصادقة، MFA، الخمول (28/30 د)، حراسة الأدوار | `permissions.test.ts`, `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| B1–B7 | الهيكل الأكاديمي، ربط المواد، تنبيهات الفك و `is_active` | `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| C1–C7 | المحتوى التعليمي، قائمة التحقق، النطاقات، التعقيم، المعاينة | `link-domains.test.ts`, `sanitize.test.ts`, `publish-checklist.test.ts`, `playwright-cli` | ناجح |
| D1–D4 | مصفوفة الأسعار والخطط ومنح الاشتراك اليدوي | `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| E1–E4 | مراجعة المدفوعات، الإيصال الموقّع، القبول والرفض، خطأ نهاية الترم | `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| F1–F7 | الطلاب، التمديد، الحظر وإنهاء الجلسات، تغيير المسار والموقع، تصفير الجهاز | `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| G1–G6 | الامتحانات، استيراد Excel، قواعد الجمهور والتعارض، القفل بعد البدء، المراقبة | `xlsx.test.ts`, `exam-coverage.test.ts`, `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| H1–H6 | التصحيح المجهول 6 أعمدة، الاستيراد، الاعتماد، تعديل المقالي للمدير فقط | `xlsx.test.ts`, `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| I1–I3 | الإعلانات، عداد المستلمين قبل الإرسال، منع المحظورين | `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| J1–J3 | التقارير بـ 7 تبويبات وتصدير Excel وشريط الاقتطاع | `xlsx.test.ts`, `playwright-cli` | ناجح |
| K1–K3 | الفريق، تعديل الأدوار وحماية آخر مدير، سجل التدقيق للقراءة فقط | `mockAdapter.test.ts`, `playwright-cli` | ناجح |
| L1–L7 | الإعدادات، النطاقات، تواريخ الترمات، استيراد الإدارات، تصفية نهاية العام بـ `DELETE` | `xlsx.test.ts`, `mockAdapter.test.ts`, `playwright-cli` | ناجح |
