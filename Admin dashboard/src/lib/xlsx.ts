import * as XLSX from 'xlsx';
import type {
  GradeImportRow,
  GradingExportRow,
  ImportErrorDetail,
  QuestionType,
} from '../data/types';
import { parseDecimalInput } from './format';

export const GRADING_EXPORT_HEADERS = [
  'answer_code',
  'question_position',
  'question_text',
  'answer_text',
  'max_points',
  'score',
] as const;

export const QUESTION_TEMPLATE_HEADERS = [
  'type',
  'prompt',
  'points',
  'option_1',
  'option_2',
  'option_3',
  'option_4',
  'option_5',
  'option_6',
  'correct_option',
] as const;

export interface ParsedQuestionRow {
  question_type: QuestionType;
  prompt: string;
  points: number;
  options: Array<{ option_text: string; is_correct: boolean; sort_order: number }>;
}

export interface QuestionsParseResult {
  valid: ParsedQuestionRow[];
  errors: ImportErrorDetail[];
}

export function buildQuestionsTemplateWorkbook(): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([
    [...QUESTION_TEMPLATE_HEADERS],
    ['mcq', 'ما هي وحدة قياس شدة التيار الكهربي؟', 2, 'الأمبير', 'الفولت', 'الأوم', 'الواط', '', '', 1],
    ['essay', 'اشرح قانون أوم للدائرة المغلقة مع ذكر العوامل المؤثرة.', 5, '', '', '', '', '', '', ''],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

export function parseQuestionsExcelBuffer(buffer: ArrayBuffer): QuestionsParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return { valid: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'الملف فارغ.' }] };
  }
  const sheet = wb.Sheets[firstSheetName];
  if (!sheet) {
    return { valid: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'ورقة العمل غير صالحة.' }] };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length === 0) {
    return { valid: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'لا توجد صفوف بيانات.' }] };
  }

  if (rows.length > 500) {
    return {
      valid: [],
      errors: [{ row: 0, code: 'IMPORT_REJECTED', message: 'الحد الأقصى للاستيراد هو 500 سؤال في الملف الواحد.' }],
    };
  }

  const valid: ParsedQuestionRow[] = [];
  const errors: ImportErrorDetail[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // header is row 1
    const rawType = String(raw.type ?? '').trim().toLowerCase();
    const prompt = String(raw.prompt ?? '').trim();
    const points = parseDecimalInput(raw.points);

    if (rawType !== 'mcq' && rawType !== 'essay') {
      errors.push({ row: rowNumber, code: 'CHECK_FAILED', message: 'نوع السؤال يجب أن يكون mcq أو essay.' });
      return;
    }

    if (!prompt) {
      errors.push({ row: rowNumber, code: 'CHECK_FAILED', message: 'نص السؤال (prompt) مطلوب.' });
      return;
    }

    if (points === null || points <= 0) {
      errors.push({ row: rowNumber, code: 'INVALID_SCORE', message: 'الدرجة (points) يجب أن تكون رقمًا أكبر من صفر.' });
      return;
    }

    const optValues = [
      raw.option_1,
      raw.option_2,
      raw.option_3,
      raw.option_4,
      raw.option_5,
      raw.option_6,
    ]
      .map((v) => String(v ?? '').trim())
      .filter((v) => v.length > 0);

    const rawCorrect = String(raw.correct_option ?? '').trim();

    if (rawType === 'essay') {
      if (optValues.length > 0 || rawCorrect.length > 0) {
        errors.push({
          row: rowNumber,
          code: 'ESSAY_CANNOT_HAVE_OPTIONS',
          message: 'السؤال المقالي لا يقبل خيارات أو رقم إجابة صحيحة.',
        });
        return;
      }
      valid.push({
        question_type: 'essay',
        prompt,
        points,
        options: [],
      });
      return;
    }

    // MCQ rules
    if (optValues.length < 2 || optValues.length > 6) {
      errors.push({
        row: rowNumber,
        code: 'MCQ_INVALID',
        message: 'سؤال الاختيار من متعدد يتطلب من 2 إلى 6 خيارات.',
      });
      return;
    }

    const correctIdx = parseDecimalInput(rawCorrect);
    if (
      correctIdx === null ||
      !Number.isInteger(correctIdx) ||
      correctIdx < 1 ||
      correctIdx > optValues.length
    ) {
      errors.push({
        row: rowNumber,
        code: 'MCQ_INVALID',
        message: `correct_option يجب أن يكون رقمًا صحيحًا بين 1 و ${optValues.length}.`,
      });
      return;
    }

    valid.push({
      question_type: 'mcq',
      prompt,
      points,
      options: optValues.map((option_text, i) => ({
        option_text,
        is_correct: i + 1 === correctIdx,
        sort_order: i + 1,
      })),
    });
  });

  return { valid, errors };
}

export function buildGradingExportWorkbook(rows: ReadonlyArray<GradingExportRow>): Uint8Array {
  const data = rows.map((r) => [
    r.answer_code,
    r.question_position,
    r.question_text,
    r.answer_text,
    r.max_points,
    r.score ?? '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([[...GRADING_EXPORT_HEADERS], ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Grading');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

export interface GradesParseResult {
  rows: GradeImportRow[];
  errors: ImportErrorDetail[];
}

export function parseGradesImportBuffer(buffer: ArrayBuffer): GradesParseResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'array' });
  } catch {
    return { rows: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'تعذر قراءة الملف.' }] };
  }

  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) {
    return { rows: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'الملف فارغ.' }] };
  }
  const sheet = wb.Sheets[firstSheet];
  if (!sheet) {
    return { rows: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'ورقة العمل غير صالحة.' }] };
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rawRows.length === 0) {
    return { rows: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'الملف لا يحتوي على صفوف.' }] };
  }

  const rows: GradeImportRow[] = [];
  const errors: ImportErrorDetail[] = [];
  const seenKeys = new Set<string>();

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const answerCode = String(raw.answer_code ?? '').trim();
    const pos = parseDecimalInput(raw.question_position);
    const maxPoints = parseDecimalInput(raw.max_points);
    const score = parseDecimalInput(raw.score);

    if (!answerCode) {
      errors.push({ row: rowNumber, code: 'UNKNOWN_ANSWER_CODE', message: 'كود الإجابة مفقود.' });
      return;
    }

    if (pos === null || !Number.isInteger(pos) || pos <= 0) {
      errors.push({ row: rowNumber, code: 'UNKNOWN_ESSAY_QUESTION', message: 'رقم السؤال غير صالح.' });
      return;
    }

    const key = `${answerCode}::${pos}`;
    if (seenKeys.has(key)) {
      errors.push({ row: rowNumber, code: 'DUPLICATE_ROW', message: 'صف مكرر لنفس كود الإجابة والسؤال.' });
      return;
    }
    seenKeys.add(key);

    if (score === null || score < 0) {
      errors.push({ row: rowNumber, code: 'INVALID_SCORE', message: 'الدرجة غير صالحة أو سالبة.' });
      return;
    }

    if (maxPoints !== null && score > maxPoints) {
      errors.push({
        row: rowNumber,
        code: 'SCORE_ABOVE_MAX',
        message: `الدرجة (${score}) تتجاوز الدرجة القصوى (${maxPoints}).`,
      });
      return;
    }

    rows.push({
      answer_code: answerCode,
      question_position: pos,
      score,
    });
  });

  return { rows, errors };
}

export interface ParsedAdministrationRow {
  governorate: string;
  administration: string;
}

export function parseAdministrationsExcelBuffer(buffer: ArrayBuffer): {
  rows: ParsedAdministrationRow[];
  errors: ImportErrorDetail[];
} {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName || !wb.Sheets[sheetName]) {
    return { rows: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'الملف فارغ.' }] };
  }
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' });
  if (rawRows.length === 0) {
    return { rows: [], errors: [{ row: 0, code: 'EMPTY_OR_INVALID_FILE', message: 'لا توجد بيانات.' }] };
  }

  const rows: ParsedAdministrationRow[] = [];
  const errors: ImportErrorDetail[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const governorate = String(raw.governorate ?? '').trim();
    const administration = String(raw.administration ?? '').trim();
    if (!governorate || !administration) {
      errors.push({ row: rowNumber, code: 'CHECK_FAILED', message: 'اسم المحافظة والإدارة مطلوبان.' });
      return;
    }
    rows.push({ governorate, administration });
  });

  return { rows, errors };
}

export function downloadUint8ArrayAsFile(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportTableToXlsx(
  filename: string,
  sheetName: string,
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>
): void {
  const normalizedRows = rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : v)));
  const ws = XLSX.utils.aoa_to_sheet([[...headers], ...normalizedRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
  downloadUint8ArrayAsFile(bytes, filename);
}
