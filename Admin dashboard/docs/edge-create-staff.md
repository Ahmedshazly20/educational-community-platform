# مواصفات Edge Function: `create-staff`

نظرًا لأن إنشاء مستخدم جديد في Supabase Auth (`auth.users`) يتطلب صلاحية `service_role` ولا يجوز تعريضها في المتصفح، تعتمد شاشة إضافة الموظف (`/staff`) على استدعاء Edge Function باسم `create-staff`.

## الطلب (`POST /functions/v1/create-staff`)
```json
{
  "email": "staff@example.com",
  "full_name": "الاسم الكامل",
  "password": "StrongPassword123!",
  "roles": ["content", "exams"]
}
```

## التحقق والتفويض داخل الدالة
1. التحقق من JWT المستدعي وأن له دور `admin` نشط في `staff_roles`.
2. التحقق من صحة المدخلات (بريد إلكتروني صحيح، كلمة مرور 8 أحرف على الأقل، دور واحد صالح على الأقل من الأدوار السبعة).
3. إنشاء المستخدم عبر `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`.
4. إدراج سجل `staff_profiles` وأدوار `staff_roles` وتسجيل حدث في `audit_log` (`action = 'create_staff'`).

## الاستجابات المتوقعة
- `200 OK`: يرجع ملف الموظف المنشأ وأدواره.
- `403 Forbidden`: `NOT_ALLOWED` إذا لم يكن المنفّذ مديرًا عامًا.
- `409 Conflict`: `EMAIL_EXISTS` إذا كان البريد مستخدمًا مسبقًا.
- `400 Bad Request`: `INVALID_ROLES` أو خطأ تحقق.
- `404 Not Found`: في حال عدم نشر الدالة بعد؛ تعرض الواجهة تنبيهًا واضحًا بالعربية دون تعطل.
