import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  GRADING_EXPORT_HEADERS,
  buildGradingExportWorkbook,
  parseGradesImportBuffer,
  parseQuestionsExcelBuffer,
} from './xlsx';

test('parseQuestionsExcelBuffer validates MCQ, essay, and reports exact row errors', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['type', 'prompt', 'points', 'option_1', 'option_2', 'option_3', 'option_4', 'option_5', 'option_6', 'correct_option'],
    ['mcq', 'سؤال صحيح', 2, 'أ', 'ب', '', '', '', '', 2],
    ['essay', 'مقالي بخيارات خاطئة', 5, 'خيار', '', '', '', '', '', ''],
    ['mcq', 'نقص خيارات', 1, 'خيار واحد فقط', '', '', '', '', '', 1],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Q');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const res = parseQuestionsExcelBuffer(buf);
  assert.equal(res.valid.length, 1);
  assert.equal(res.errors.length, 2);
  assert.equal(res.errors[0]?.row, 3);
  assert.equal(res.errors[0]?.code, 'ESSAY_CANNOT_HAVE_OPTIONS');
  assert.equal(res.errors[1]?.row, 4);
  assert.equal(res.errors[1]?.code, 'MCQ_INVALID');
});

test('grading export produces exact 6 anonymous columns and import accepts comma decimals + Arabic-Indic digits', () => {
  const bytes = buildGradingExportWorkbook([
    {
      answer_code: 'ANS-001',
      question_position: 3,
      question_text: 'اشرح الظاهرة',
      answer_text: 'إجابة الطالب',
      max_points: 5,
      score: 4,
    },
  ]);

  const wb = XLSX.read(bytes, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
  assert.ok(sheet);
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  assert.deepEqual(aoa[0], [...GRADING_EXPORT_HEADERS]);

  // Now parse an import sheet with comma decimal and Arabic-Indic digits
  const importWs = XLSX.utils.aoa_to_sheet([
    ['answer_code', 'question_position', 'question_text', 'answer_text', 'max_points', 'score'],
    ['ANS-001', 3, 'اشرح', 'إجابة', 5, '٣,٥'],
  ]);
  const importWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(importWb, importWs, 'Grading');
  const importBuf = XLSX.write(importWb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const parsed = parseGradesImportBuffer(importBuf);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.score, 3.5);
});

test('parseGradesImportBuffer rejects duplicate rows and score above max', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['answer_code', 'question_position', 'max_points', 'score'],
    ['ANS-001', 1, 5, 6],
    ['ANS-002', 1, 5, 4],
    ['ANS-002', 1, 5, 3],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'G');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const parsed = parseGradesImportBuffer(buf);
  assert.equal(parsed.errors.length, 2);
  assert.equal(parsed.errors[0]?.code, 'SCORE_ABOVE_MAX');
  assert.equal(parsed.errors[1]?.code, 'DUPLICATE_ROW');
});
