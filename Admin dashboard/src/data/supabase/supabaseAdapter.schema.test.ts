import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TABLE_SCHEMA, RPC_SCHEMA, ENUM_VALUES } from './schemaContract';
import { SupabaseAdminApi } from './supabaseAdapter';
import { normalizeSupabaseUrl } from './supabaseClient';
import { AppError } from '../../lib/errors';

/**
 * Recursively parses a PostgREST `.select(...)` expression like:
 *   `*, courses(name_ar), lesson_items(id, item_type)`
 * or `*, quick_questions(*, quick_question_options(*))`
 * and verifies every referenced relation and column exists in `TABLE_SCHEMA`.
 */
function validateSelectExpression(rootTable: string, selectExpr: string, contextLabel: string): string[] {
  const errors: string[] = [];
  const rootDef = TABLE_SCHEMA[rootTable];
  if (!rootDef) {
    errors.push(`${contextLabel}: unknown table "${rootTable}"`);
    return errors;
  }

  let i = 0;
  const len = selectExpr.length;

  function parseFieldList(currentTable: string): void {
    const def = TABLE_SCHEMA[currentTable];
    if (!def) {
      errors.push(`${contextLabel}: unknown relation "${currentTable}"`);
    }

    while (i < len) {
      while (i < len && /[\s,]/.test(selectExpr[i] ?? '')) i++;
      if (i >= len || selectExpr[i] === ')') {
        if (selectExpr[i] === ')') i++;
        return;
      }

      let token = '';
      while (i < len && !/[,()]/.test(selectExpr[i] ?? '')) {
        token += selectExpr[i];
        i++;
      }
      token = token.trim();
      if (!token) continue;

      const afterAlias = token.includes(':') ? token.split(':').slice(1).join(':') : token;
      const cleanName = afterAlias.split('!')[0]?.trim() ?? '';

      if (i < len && selectExpr[i] === '(') {
        i++;
        parseFieldList(cleanName);
      } else if (cleanName && cleanName !== '*') {
        const colName = cleanName.split('::')[0]?.trim() ?? '';
        if (def && colName && !def.columns.includes(colName)) {
          errors.push(`${contextLabel}: column "${currentTable}.${colName}" does not exist in schema`);
        }
      }
    }
  }

  parseFieldList(rootTable);
  return errors;
}

interface Token {
  type: 'ident' | 'string' | 'template' | 'punct' | 'other';
  value: string;
  line: number;
}

/**
 * Lightweight JS/TS tokenizer preserving string literals, template heads, identifiers, and punctuation.
 * Comments are skipped while keeping line counts exact.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const n = source.length;

  while (i < n) {
    const ch = source[i]!;
    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Line comment
    if (ch === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    // Single or double quoted string
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const startLine = line;
      i++;
      let val = '';
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\') {
          val += source[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (source[i] === '\n') line++;
        val += source[i];
        i++;
      }
      i++;
      tokens.push({ type: 'string', value: val, line: startLine });
      continue;
    }
    // Template literal: collect static pieces replacing ${...} with $EXPR
    if (ch === '`') {
      const startLine = line;
      i++;
      let val = '';
      while (i < n && source[i] !== '`') {
        if (source[i] === '\\') {
          val += source[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (source[i] === '\n') line++;
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            i++;
          }
          val += '$EXPR';
          continue;
        }
        if (source[i] === '\n') line++;
        val += source[i];
        i++;
      }
      i++;
      tokens.push({ type: 'template', value: val, line: startLine });
      continue;
    }
    // Identifier
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(source[i]!)) i++;
      tokens.push({ type: 'ident', value: source.slice(start, i), line });
      continue;
    }
    // Punctuation
    if ('(){}[],.;:='.includes(ch)) {
      tokens.push({ type: 'punct', value: ch, line });
      i++;
      continue;
    }
    i++;
  }
  return tokens;
}

/**
 * Splits a token slice inside `(...)` at top-level commas into argument token arrays.
 */
function splitArgs(tokens: Token[], openParenIdx: number): { args: Token[][]; closeIdx: number } {
  const args: Token[][] = [];
  let cur: Token[] = [];
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let i = openParenIdx + 1;

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.type === 'punct') {
      if (t.value === '(') parenDepth++;
      else if (t.value === ')') {
        if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
          if (cur.length > 0) args.push(cur);
          return { args, closeIdx: i };
        }
        parenDepth--;
      } else if (t.value === '{') braceDepth++;
      else if (t.value === '}') braceDepth--;
      else if (t.value === '[') bracketDepth++;
      else if (t.value === ']') bracketDepth--;
      else if (t.value === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
        args.push(cur);
        cur = [];
        i++;
        continue;
      }
    }
    cur.push(t);
    i++;
  }
  if (cur.length > 0) args.push(cur);
  return { args, closeIdx: tokens.length - 1 };
}

/**
 * Extracts top-level property keys from an object literal or array of object literals.
 * Handles shorthand `{ id }` and key-value `{ id: ... }` properties while skipping `...spread`.
 */
function extractObjectKeys(argTokens: Token[] | undefined): string[] {
  if (!argTokens || argTokens.length === 0) return [];
  const keys = new Set<string>();
  let braceDepth = 0;

  for (let i = 0; i < argTokens.length; i++) {
    const t = argTokens[i]!;
    if (t.type === 'punct') {
      if (t.value === '{') {
        braceDepth++;
        if (braceDepth === 1) {
          const next = argTokens[i + 1];
          const after = argTokens[i + 2];
          if (next && (next.type === 'ident' || next.type === 'string')) {
            if (!after || (after.type === 'punct' && (after.value === ':' || after.value === ',' || after.value === '}'))) {
              keys.add(next.value);
            }
          }
        }
      } else if (t.value === '}') {
        braceDepth--;
      } else if (t.value === ',' && braceDepth === 1) {
        const next = argTokens[i + 1];
        const after = argTokens[i + 2];
        if (next && (next.type === 'ident' || next.type === 'string')) {
          if (!after || (after.type === 'punct' && (after.value === ':' || after.value === ',' || after.value === '}'))) {
            keys.add(next.value);
          }
        }
      }
    }
  }
  return Array.from(keys);
}

function getSingleStringToken(argTokens: Token[] | undefined): string | null {
  if (!argTokens || argTokens.length !== 1) return null;
  const t = argTokens[0]!;
  if (t.type === 'string' || t.type === 'template') return t.value;
  return null;
}

const COLUMN_FILTER_METHODS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'ilike', 'like', 'is', 'order']);

export function auditSupabaseSource(source: string, label = 'supabaseAdapter.ts'): string[] {
  const tokens = tokenize(source);
  const violations: string[] = [];

  // Scope stack mapping query builder variable names (`let q = this.sb.from(...)`) to table names
  const scopeStack: Array<Map<string, string>> = [new Map()];
  const lookupVarTable = (name: string): string | undefined => {
    for (let s = scopeStack.length - 1; s >= 0; s--) {
      const found = scopeStack[s]?.get(name);
      if (found) return found;
    }
    return undefined;
  };
  const setVarTable = (name: string, table: string) => {
    scopeStack[scopeStack.length - 1]?.set(name, table);
  };

  function validateChainCall(table: string, methodName: string, args: Token[][], line: number): void {
    const loc = `${label}:${line}`;
    const tableDef = TABLE_SCHEMA[table];
    if (!tableDef) {
      violations.push(`${loc}: unknown table/view "${table}"`);
      return;
    }

    if (methodName === 'select') {
      const selStr = getSingleStringToken(args[0]);
      if (selStr) {
        violations.push(...validateSelectExpression(table, selStr, loc));
      }
      return;
    }

    if (COLUMN_FILTER_METHODS.has(methodName)) {
      const col = getSingleStringToken(args[0]);
      if (col && !tableDef.columns.includes(col)) {
        violations.push(`${loc}: column "${table}.${col}" does not exist in .${methodName}()`);
      }
      if (methodName === 'eq' && col) {
        const litVal = getSingleStringToken(args[1]);
        if (litVal) {
          if (table === 'lessons' && col === 'status' && !ENUM_VALUES.lesson_status.includes(litVal)) {
            violations.push(`${loc}: invalid lesson status "${litVal}"`);
          }
          if (table === 'exams' && col === 'status' && !ENUM_VALUES.exam_status.includes(litVal)) {
            violations.push(`${loc}: invalid exam status "${litVal}"`);
          }
          if (table === 'payment_requests' && col === 'status' && !ENUM_VALUES.payment_status.includes(litVal)) {
            violations.push(`${loc}: invalid payment status "${litVal}"`);
          }
          if (table === 'subscriptions' && col === 'status' && !ENUM_VALUES.subscription_status.includes(litVal)) {
            violations.push(`${loc}: invalid subscription status "${litVal}"`);
          }
          if (table === 'exam_attempts' && col === 'status' && !ENUM_VALUES.attempt_status.includes(litVal)) {
            violations.push(`${loc}: invalid attempt status "${litVal}"`);
          }
        }
      }
      return;
    }

    if (methodName === 'or') {
      const orStr = getSingleStringToken(args[0]);
      if (orStr) {
        for (const seg of orStr.split(',')) {
          const col = seg.trim().split('.')[0]?.trim();
          if (col && !tableDef.columns.includes(col)) {
            violations.push(`${loc}: column "${table}.${col}" does not exist in .or()`);
          }
        }
      }
      return;
    }

    if (methodName === 'upsert') {
      const opts = args[1];
      if (opts) {
        for (let k = 0; k < opts.length - 2; k++) {
          if (
            (opts[k]?.value === 'onConflict') &&
            opts[k + 1]?.value === ':' &&
            (opts[k + 2]?.type === 'string' || opts[k + 2]?.type === 'template')
          ) {
            const target = opts[k + 2]!.value;
            const targetCols = target.split(',').map((s) => s.trim());
            for (const c of targetCols) {
              if (!tableDef.columns.includes(c)) {
                violations.push(`${loc}: onConflict column "${table}.${c}" does not exist`);
              }
            }
            const expectedPk = tableDef.pk.join(',');
            if (targetCols.join(',') !== expectedPk) {
              violations.push(
                `${loc}: onConflict "${target}" does not match PK "${expectedPk}" for table "${table}"`
              );
            }
          }
        }
      }
      for (const key of extractObjectKeys(args[0])) {
        if (!tableDef.columns.includes(key)) {
          violations.push(`${loc}: column "${table}.${key}" does not exist in .upsert()`);
        }
      }
      return;
    }

    if (methodName === 'insert' || methodName === 'update') {
      for (const key of extractObjectKeys(args[0])) {
        if (!tableDef.columns.includes(key)) {
          violations.push(`${loc}: column "${table}.${key}" does not exist in .${methodName}()`);
        }
      }
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === 'punct' && t.value === '{') {
      scopeStack.push(new Map());
      continue;
    }
    if (t.type === 'punct' && t.value === '}') {
      if (scopeStack.length > 1) scopeStack.pop();
      continue;
    }

    // Track `let q = this.sb.from('table')...` or `const q = ...from('table')`
    if (
      t.type === 'ident' &&
      (t.value === 'let' || t.value === 'const') &&
      tokens[i + 1]?.type === 'ident' &&
      tokens[i + 2]?.type === 'punct' &&
      tokens[i + 2]?.value === '='
    ) {
      const varName = tokens[i + 1]!.value;
      // Look ahead up to ';' for `.from('table')`
      for (let j = i + 3; j < tokens.length && tokens[j]!.value !== ';'; j++) {
        if (
          tokens[j]?.type === 'punct' &&
          tokens[j]?.value === '.' &&
          tokens[j + 1]?.type === 'ident' &&
          tokens[j + 1]?.value === 'from' &&
          tokens[j + 2]?.value === '('
        ) {
          const { args } = splitArgs(tokens, j + 2);
          const tbl = getSingleStringToken(args[0]);
          if (tbl) setVarTable(varName, tbl);
          break;
        }
      }
    }

    // Detect `.rpc('fn', { ... })`
    if (
      t.type === 'punct' &&
      t.value === '.' &&
      tokens[i + 1]?.type === 'ident' &&
      tokens[i + 1]?.value === 'rpc' &&
      tokens[i + 2]?.value === '('
    ) {
      const loc = `${label}:${tokens[i + 1]!.line}`;
      const { args } = splitArgs(tokens, i + 2);
      const rpcName = getSingleStringToken(args[0]);
      if (!rpcName) {
        violations.push(`${loc}: non-literal RPC name in .rpc()`);
      } else if (!RPC_SCHEMA[rpcName]) {
        violations.push(`${loc}: unknown RPC "${rpcName}"`);
      } else if (args[1]) {
        const expected = RPC_SCHEMA[rpcName];
        for (const key of extractObjectKeys(args[1])) {
          if (!expected.includes(key)) {
            violations.push(`${loc}: unknown RPC param "${key}" for "${rpcName}" (expected: ${expected.join(', ')})`);
          }
        }
      }
      continue;
    }

    // Detect `this.sb.from('table')...` or `sb.from('table')...` chain
    if (
      t.type === 'punct' &&
      t.value === '.' &&
      tokens[i + 1]?.type === 'ident' &&
      tokens[i + 1]?.value === 'from' &&
      tokens[i + 2]?.value === '(' &&
      !(i > 0 && (tokens[i - 1]?.value === 'storage' || tokens[i - 1]?.value === 'Array' || tokens[i - 1]?.value === 'Buffer'))
    ) {
      const loc = `${label}:${tokens[i + 1]!.line}`;
      const { args, closeIdx } = splitArgs(tokens, i + 2);
      const table = getSingleStringToken(args[0]);
      if (!table) {
        violations.push(`${loc}: non-literal table name in .from()`);
        continue;
      }
      if (!TABLE_SCHEMA[table]) {
        violations.push(`${loc}: unknown table/view "${table}"`);
        continue;
      }

      // Walk chained `.method(...)` directly following `.from('table')`
      let cur = closeIdx + 1;
      while (
        cur + 2 < tokens.length &&
        tokens[cur]?.type === 'punct' &&
        tokens[cur]?.value === '.' &&
        tokens[cur + 1]?.type === 'ident' &&
        tokens[cur + 2]?.value === '('
      ) {
        const methodName = tokens[cur + 1]!.value;
        const mLine = tokens[cur + 1]!.line;
        const callRes = splitArgs(tokens, cur + 2);
        validateChainCall(table, methodName, callRes.args, mLine);
        cur = callRes.closeIdx + 1;
      }
      continue;
    }

    // Detect `q.eq(...)`, `q.order(...)`, etc. on a tracked query-builder variable
    if (
      t.type === 'ident' &&
      tokens[i + 1]?.type === 'punct' &&
      tokens[i + 1]?.value === '.' &&
      tokens[i + 2]?.type === 'ident' &&
      tokens[i + 3]?.value === '('
    ) {
      const table = lookupVarTable(t.value);
      if (table) {
        let cur = i + 1;
        while (
          cur + 2 < tokens.length &&
          tokens[cur]?.type === 'punct' &&
          tokens[cur]?.value === '.' &&
          tokens[cur + 1]?.type === 'ident' &&
          tokens[cur + 2]?.value === '('
        ) {
          const methodName = tokens[cur + 1]!.value;
          const mLine = tokens[cur + 1]!.line;
          const callRes = splitArgs(tokens, cur + 2);
          validateChainCall(table, methodName, callRes.args, mLine);
          cur = callRes.closeIdx + 1;
        }
      }
    }
  }

  return violations;
}

test('schema audit detector catches nonexistent columns, wrong PK onConflict targets, and wrong RPC args', () => {
  const badSample = `
    await this.sb.from('staff_profiles').select('*').eq('id', uid);
    await this.sb.from('staff_roles').select('role').eq('staff_id', uid);
    await this.sb.from('allowed_link_domains').delete().eq('id', dom);
    await this.sb.from('exam_results').upsert(rows, { onConflict: 'id' });
    await this.sb.rpc('extend_trial', { student_id: uid, p_days: 7 });
  `;
  const found = auditSupabaseSource(badSample, 'sample.ts');
  assert.ok(found.some((m) => m.includes('staff_profiles.id')));
  assert.ok(found.some((m) => m.includes('staff_roles.staff_id')));
  assert.ok(found.some((m) => m.includes('allowed_link_domains.id')));
  assert.ok(found.some((m) => m.includes('onConflict "id" does not match PK "attempt_id"')));
  assert.ok(found.some((m) => m.includes('unknown RPC param "student_id"')));
});

test('supabaseAdapter.ts references only existing tables, columns, primary keys, enums, and RPC signatures', () => {
  const filePath = path.resolve(process.cwd(), 'src/data/supabase/supabaseAdapter.ts');
  const code = fs.readFileSync(filePath, 'utf8');
  const violations = auditSupabaseSource(code, 'supabaseAdapter.ts');

  assert.deepEqual(
    violations,
    [],
    `Schema contract violations in supabaseAdapter.ts:\n${violations.join('\n')}`
  );
});

interface RecordedQuery {
  table: string;
  ops: Array<{ method: string; args: unknown[] }>;
}

function createFakeSupabaseClient(
  responder: (q: RecordedQuery) => { data?: unknown; count?: number | null; error?: unknown }
) {
  const recorded: RecordedQuery[] = [];

  const from = (table: string) => {
    const entry: RecordedQuery = { table, ops: [] };
    recorded.push(entry);

    const resolveResult = () => responder(entry);
    const chain: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        entry.ops.push({ method: 'select', args });
        return chain;
      },
      insert: (...args: unknown[]) => {
        entry.ops.push({ method: 'insert', args });
        return chain;
      },
      update: (...args: unknown[]) => {
        entry.ops.push({ method: 'update', args });
        return chain;
      },
      delete: (...args: unknown[]) => {
        entry.ops.push({ method: 'delete', args });
        return chain;
      },
      eq: (...args: unknown[]) => {
        entry.ops.push({ method: 'eq', args });
        return chain;
      },
      in: (...args: unknown[]) => {
        entry.ops.push({ method: 'in', args });
        return chain;
      },
      order: (...args: unknown[]) => {
        entry.ops.push({ method: 'order', args });
        return chain;
      },
      maybeSingle: async () => resolveResult(),
      single: async () => resolveResult(),
      then: (onFulfilled: (val: unknown) => unknown, onRejected?: (err: unknown) => unknown) =>
        Promise.resolve(resolveResult()).then(onFulfilled, onRejected),
    };
    return chain;
  };

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'staff-user-1', email: 'admin@example.com' } } },
        error: null,
      }),
      signInWithPassword: async () => ({ error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2' }, error: null }),
      },
    },
    from,
  };

  return { client: client as unknown as ConstructorParameters<typeof SupabaseAdminApi>[0], recorded };
}

test('SupabaseAdminApi login/session queries staff_profiles & staff_roles by user_id and surfaces 42703 cleanly', async () => {
  const { client, recorded } = createFakeSupabaseClient((q) => {
    if (q.table === 'staff_profiles') {
      return {
        data: {
          user_id: 'staff-user-1',
          full_name: 'مدير النظام',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        error: null,
      };
    }
    if (q.table === 'staff_roles') {
      return { data: [{ role: 'admin' }], error: null };
    }
    return { data: [], error: null };
  });

  const api = new SupabaseAdminApi(client);
  const sess = await api.signIn('admin@example.com', 'secret');
  assert.equal(sess.userId, 'staff-user-1');
  assert.equal(sess.profile?.id, 'staff-user-1');
  assert.deepEqual(sess.roles, ['admin']);

  const spQuery = recorded.find((q) => q.table === 'staff_profiles');
  const srQuery = recorded.find((q) => q.table === 'staff_roles');
  assert.ok(spQuery?.ops.some((o) => o.method === 'eq' && o.args[0] === 'user_id' && o.args[1] === 'staff-user-1'));
  assert.ok(srQuery?.ops.some((o) => o.method === 'eq' && o.args[0] === 'user_id' && o.args[1] === 'staff-user-1'));

  const failing = createFakeSupabaseClient((q) => {
    if (q.table === 'staff_profiles') {
      return { data: null, error: { code: '42703', message: 'column staff_profiles.id does not exist' } };
    }
    return { data: [], error: null };
  });
  const failingApi = new SupabaseAdminApi(failing.client);
  await assert.rejects(
    () => failingApi.getCurrentSession(),
    (err: unknown) =>
      err instanceof AppError &&
      err.code === 'DATA_CONNECTION_ERROR' &&
      err.message === 'خطأ في اتصال البيانات (42703)'
  );
});

test('SupabaseAdminApi uses exact frozen PKs for allowed_link_domains, exam_results, and quick_answers', async () => {
  const { client, recorded } = createFakeSupabaseClient((q) => {
    if (q.table === 'allowed_link_domains') {
      return { data: { domain: 'youtube.com', kind: 'video', is_active: true }, error: null };
    }
    if (q.table === 'item_progress') {
      return {
        data: [
          {
            student_id: 'stu-1',
            item_id: 'item-1',
            completed_at: '2026-02-01T10:00:00Z',
            lesson_items: { title: 'شرح 1', lesson_id: 'les-1', lessons: { title: 'الدرس الأول' } },
          },
        ],
        error: null,
      };
    }
    if (q.table === 'quick_answers') {
      return {
        data: [
          {
            student_id: 'stu-1',
            question_id: 'qq-1',
            selected_option_id: 'opt-1',
            is_correct: true,
            answered_at: '2026-02-01T10:05:00Z',
            quick_questions: { prompt: 'سؤال؟' },
            quick_question_options: { option_text: 'إجابة أ' },
          },
        ],
        error: null,
      };
    }
    if (q.table === 'exam_results') {
      return {
        data: [
          {
            attempt_id: 'att-99',
            exam_id: 'ex-1',
            student_id: 'stu-1',
            mcq_score: 10,
            essay_score: 5,
            total_score: 15,
            max_score: 20,
            percentage: 75,
            ai_graded: false,
            approved_at: '2026-02-02T12:00:00Z',
            exams: { title: 'اختبار الشهر' },
          },
        ],
        error: null,
      };
    }
    return { data: [], error: null };
  });

  const api = new SupabaseAdminApi(client);
  const updated = await api.updateAllowedLinkDomain('youtube.com', {
    domain: 'youtube.com',
    kind: 'video',
    is_active: false,
  });
  assert.equal(updated.id, 'youtube.com');
  await api.deleteAllowedLinkDomain('youtube.com');

  const domainQueries = recorded.filter((q) => q.table === 'allowed_link_domains');
  assert.equal(domainQueries.length, 2);
  for (const dq of domainQueries) {
    assert.ok(dq.ops.some((o) => o.method === 'eq' && o.args[0] === 'domain' && o.args[1] === 'youtube.com'));
  }

  const activity = await api.getStudentActivity('stu-1');
  assert.equal(activity.progress[0]?.lesson_title, 'الدرس الأول');
  assert.equal(activity.quickAnswers[0]?.id, 'qq-1');
  assert.equal(activity.quickAnswers[0]?.selected_option_text, 'إجابة أ');

  const exams = await api.getStudentExams('stu-1');
  assert.equal(exams.results[0]?.id, 'att-99');
  assert.equal(exams.results[0]?.attempt_id, 'att-99');
});

test('normalizeSupabaseUrl strips accidental /rest/v1 suffix and trailing slashes', () => {
  assert.equal(
    normalizeSupabaseUrl('https://wmqfxjzbjhpxcilqjpff.supabase.co/rest/v1'),
    'https://wmqfxjzbjhpxcilqjpff.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('https://wmqfxjzbjhpxcilqjpff.supabase.co/rest/v1/'),
    'https://wmqfxjzbjhpxcilqjpff.supabase.co'
  );
  assert.equal(
    normalizeSupabaseUrl('https://wmqfxjzbjhpxcilqjpff.supabase.co/'),
    'https://wmqfxjzbjhpxcilqjpff.supabase.co'
  );
});

