import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TABLE_SCHEMA, RPC_SCHEMA, ENUM_VALUES } from './schemaContract';
import { SupabaseAdminApi, normalizeQrDataUri } from './supabaseAdapter';
import { normalizeSupabaseUrl } from './supabaseClient';
import { AppError } from '../../lib/errors';

/**
 * Recursively parses a PostgREST `.select(...)` expression like:
 *   `id, title, courses(name_ar), lesson_items(id, item_type)`
 * and verifies every referenced relation and column exists in `TABLE_SCHEMA`,
 * while forbidding `*` wildcards.
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
      } else if (cleanName === '*') {
        errors.push(`${contextLabel}: wildcard select("*") is disallowed on "${currentTable}"`);
      } else if (cleanName) {
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
    if (ch === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
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
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_$]/.test(source[i]!)) i++;
      tokens.push({ type: 'ident', value: source.slice(start, i), line });
      continue;
    }
    if ('(){}[],.;:='.includes(ch)) {
      tokens.push({ type: 'punct', value: ch, line });
      i++;
      continue;
    }
    i++;
  }
  return tokens;
}

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

function resolveStringArg(
  argTokens: Token[] | undefined,
  stringConsts: Map<string, string>
): string | null {
  if (!argTokens || argTokens.length !== 1) return null;
  const t = argTokens[0]!;
  if (t.type === 'string' || t.type === 'template') return t.value;
  if (t.type === 'ident' && stringConsts.has(t.value)) return stringConsts.get(t.value)!;
  return null;
}

const COLUMN_FILTER_METHODS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'ilike',
  'like',
  'is',
  'order',
]);

export function auditSupabaseSource(source: string, label = 'supabaseAdapter.ts'): string[] {
  const tokens = tokenize(source);
  const violations: string[] = [];

  // Collect string constants like `const LESSON_COLS = 'id, ...'`
  const stringConsts = new Map<string, string>();
  for (let i = 0; i + 4 < tokens.length; i++) {
    if (
      tokens[i]?.type === 'ident' &&
      tokens[i]?.value === 'const' &&
      tokens[i + 1]?.type === 'ident' &&
      tokens[i + 2]?.value === '=' &&
      tokens[i + 3]?.type === 'string' &&
      tokens[i + 4]?.value === ';'
    ) {
      stringConsts.set(tokens[i + 1]!.value, tokens[i + 3]!.value);
    }
  }

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
      if (args.length === 0) {
        violations.push(`${loc}: bare .select() is disallowed on "${table}" — list columns explicitly`);
        return;
      }
      const selStr = resolveStringArg(args[0], stringConsts);
      if (selStr === null) {
        violations.push(`${loc}: dynamic .select() on "${table}" cannot be verified against schema`);
      } else {
        violations.push(...validateSelectExpression(table, selStr, loc));
      }
      return;
    }

    if (COLUMN_FILTER_METHODS.has(methodName)) {
      const col = resolveStringArg(args[0], stringConsts);
      if (col && !tableDef.columns.includes(col)) {
        violations.push(`${loc}: column "${table}.${col}" does not exist in .${methodName}()`);
      }
      if (methodName === 'eq' && col) {
        const litVal = resolveStringArg(args[1], stringConsts);
        if (litVal) {
          if (table === 'lessons' && col === 'status' && !ENUM_VALUES.lesson_status.includes(litVal)) {
            violations.push(`${loc}: invalid lesson_status "${litVal}"`);
          }
          if (table === 'exams' && col === 'status' && !ENUM_VALUES.exam_status.includes(litVal)) {
            violations.push(`${loc}: invalid exam_status "${litVal}"`);
          }
          if (table === 'payment_requests' && col === 'status' && !ENUM_VALUES.payment_status.includes(litVal)) {
            violations.push(`${loc}: invalid payment_status "${litVal}"`);
          }
          if (table === 'subscriptions' && col === 'status' && !ENUM_VALUES.sub_status.includes(litVal)) {
            violations.push(`${loc}: invalid sub_status "${litVal}"`);
          }
          if (table === 'exam_attempts' && col === 'status' && !ENUM_VALUES.attempt_status.includes(litVal)) {
            violations.push(`${loc}: invalid attempt_status "${litVal}"`);
          }
        }
      }
      return;
    }

    if (methodName === 'or') {
      const orStr = resolveStringArg(args[0], stringConsts);
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
            opts[k]?.value === 'onConflict' &&
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

    if (
      t.type === 'ident' &&
      (t.value === 'let' || t.value === 'const') &&
      tokens[i + 1]?.type === 'ident' &&
      tokens[i + 2]?.type === 'punct' &&
      tokens[i + 2]?.value === '='
    ) {
      const varName = tokens[i + 1]!.value;
      for (let j = i + 3; j < tokens.length && tokens[j]!.value !== ';'; j++) {
        if (
          tokens[j]?.type === 'punct' &&
          tokens[j]?.value === '.' &&
          tokens[j + 1]?.type === 'ident' &&
          tokens[j + 1]?.value === 'from' &&
          tokens[j + 2]?.value === '('
        ) {
          const { args } = splitArgs(tokens, j + 2);
          const tbl = resolveStringArg(args[0], stringConsts);
          if (tbl) setVarTable(varName, tbl);
          break;
        }
      }
    }

    if (
      t.type === 'punct' &&
      t.value === '.' &&
      tokens[i + 1]?.type === 'ident' &&
      tokens[i + 1]?.value === 'rpc' &&
      tokens[i + 2]?.value === '('
    ) {
      const loc = `${label}:${tokens[i + 1]!.line}`;
      const { args } = splitArgs(tokens, i + 2);
      const rpcName = resolveStringArg(args[0], stringConsts);
      if (!rpcName) {
        violations.push(`${loc}: non-literal RPC name in .rpc()`);
      } else if (!RPC_SCHEMA[rpcName]) {
        violations.push(`${loc}: unknown RPC "${rpcName}"`);
      } else if (args[1]) {
        const expected = RPC_SCHEMA[rpcName];
        for (const key of extractObjectKeys(args[1])) {
          if (!expected.includes(key)) {
            violations.push(
              `${loc}: unknown RPC param "${key}" for "${rpcName}" (expected: ${expected.join(', ')})`
            );
          }
        }
      }
      continue;
    }

    if (
      t.type === 'punct' &&
      t.value === '.' &&
      tokens[i + 1]?.type === 'ident' &&
      tokens[i + 1]?.value === 'from' &&
      tokens[i + 2]?.value === '(' &&
      !(
        i > 0 &&
        (tokens[i - 1]?.value === 'storage' ||
          tokens[i - 1]?.value === 'Array' ||
          tokens[i - 1]?.value === 'Buffer')
      )
    ) {
      const loc = `${label}:${tokens[i + 1]!.line}`;
      const { args, closeIdx } = splitArgs(tokens, i + 2);
      const table = resolveStringArg(args[0], stringConsts);
      if (!table) {
        violations.push(`${loc}: non-literal table name in .from()`);
        continue;
      }
      if (!TABLE_SCHEMA[table]) {
        violations.push(`${loc}: unknown table/view "${table}"`);
        continue;
      }

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

test('schemaContract.ts matches authoritative 06_SCHEMA_COLUMNS_89c2701b.md 100%', () => {
  const mdPath = path.resolve(process.cwd(), 'public/assets/aistudio/06_SCHEMA_COLUMNS_89c2701b.md');
  const md = fs.readFileSync(mdPath, 'utf8');

  const parsedTables: Record<string, { pk: string[]; columns: string[] }> = {};
  const parsedRpcs: Record<string, string[]> = {};
  const parsedEnums: Record<string, string[]> = {};

  let section: 'tables' | 'rpcs' | 'enums' | null = null;
  let currentTable: string | null = null;

  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('## الجداول')) {
      section = 'tables';
      currentTable = null;
      continue;
    }
    if (line.startsWith('## الدوال')) {
      section = 'rpcs';
      currentTable = null;
      continue;
    }
    if (line.startsWith('## الـ Enums')) {
      section = 'enums';
      currentTable = null;
      continue;
    }

    if (section === 'tables') {
      const tblMatch = line.match(/^###\s+`([^`]+)`(?:\s+—\s+PK:\s+\(([^)]+)\)|\s+—\s+\(view\))/);
      if (tblMatch) {
        currentTable = tblMatch[1]!;
        const pk = tblMatch[2] ? tblMatch[2].split(',').map((s) => s.trim()) : [];
        parsedTables[currentTable] = { pk, columns: [] };
        continue;
      }
      const colMatch = line.match(/^-\s+`([^`]+)`:/);
      if (colMatch && currentTable) {
        parsedTables[currentTable]!.columns.push(colMatch[1]!);
      }
    } else if (section === 'rpcs') {
      const rpcMatch = line.match(/^-\s+`([a-zA-Z0-9_]+)\(([^)]*)\)`/);
      if (rpcMatch) {
        const fnName = rpcMatch[1]!;
        const argList = rpcMatch[2]!.trim();
        const params = argList
          ? argList
              .split(',')
              .map((p) => p.trim().split(/\s+/)[0]!)
              .filter(Boolean)
          : [];
        parsedRpcs[fnName] = params;
      }
    } else if (section === 'enums') {
      const enumMatch = line.match(/^-\s+`([a-zA-Z0-9_]+)`:\s*(.+)$/);
      if (enumMatch) {
        parsedEnums[enumMatch[1]!] = enumMatch[2]!.split(',').map((v) => v.trim());
      }
    }
  }

  assert.deepEqual(Object.keys(TABLE_SCHEMA).sort(), Object.keys(parsedTables).sort());
  for (const [name, def] of Object.entries(parsedTables)) {
    assert.deepEqual(TABLE_SCHEMA[name]?.pk, def.pk, `PK mismatch on ${name}`);
    assert.deepEqual(TABLE_SCHEMA[name]?.columns, def.columns, `Columns mismatch on ${name}`);
  }

  assert.deepEqual(Object.keys(RPC_SCHEMA).sort(), Object.keys(parsedRpcs).sort());
  for (const [name, args] of Object.entries(parsedRpcs)) {
    assert.deepEqual(RPC_SCHEMA[name], args, `RPC params mismatch on ${name}`);
  }

  assert.deepEqual(Object.keys(ENUM_VALUES).sort(), Object.keys(parsedEnums).sort());
  for (const [name, vals] of Object.entries(parsedEnums)) {
    assert.deepEqual(ENUM_VALUES[name], vals, `Enum values mismatch on ${name}`);
  }
});

test('schema audit detector catches nonexistent columns, wildcard selects, wrong PK onConflict targets, and wrong RPC args', () => {
  const badSample = `
    await this.sb.from('staff_profiles').select('*').eq('id', uid);
    await this.sb.from('audit_log').select().order('created_at', { ascending: false });
    await this.sb.from('staff_roles').select('role').eq('staff_id', uid);
    await this.sb.from('allowed_link_domains').delete().eq('id', dom);
    await this.sb.from('exam_results').upsert(rows, { onConflict: 'id' });
    await this.sb.rpc('extend_trial', { p_student_id: uid, p_days: 7 });
  `;
  const found = auditSupabaseSource(badSample, 'sample.ts');
  assert.ok(found.some((m) => m.includes('wildcard select("*") is disallowed')));
  assert.ok(found.some((m) => m.includes('bare .select() is disallowed')));
  assert.ok(found.some((m) => m.includes('audit_log.created_at')));
  assert.ok(found.some((m) => m.includes('staff_profiles.id')));
  assert.ok(found.some((m) => m.includes('staff_roles.staff_id')));
  assert.ok(found.some((m) => m.includes('allowed_link_domains.id')));
  assert.ok(found.some((m) => m.includes('onConflict "id" does not match PK "attempt_id"')));
  assert.ok(found.some((m) => m.includes('unknown RPC param "p_student_id"')));
});

test('supabaseAdapter.ts uses explicit columns with zero schema, enum, PK, or RPC mismatches', () => {
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

interface RecordedRpc {
  fn: string;
  args: Record<string, unknown>;
}

function createFakeSupabaseClient(
  responder: (q: RecordedQuery) => { data?: unknown; count?: number | null; error?: unknown },
  rpcResponder?: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown }
) {
  const recorded: RecordedQuery[] = [];
  const recordedRpcs: RecordedRpc[] = [];

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
      upsert: (...args: unknown[]) => {
        entry.ops.push({ method: 'upsert', args });
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
      gt: (...args: unknown[]) => {
        entry.ops.push({ method: 'gt', args });
        return chain;
      },
      gte: (...args: unknown[]) => {
        entry.ops.push({ method: 'gte', args });
        return chain;
      },
      lte: (...args: unknown[]) => {
        entry.ops.push({ method: 'lte', args });
        return chain;
      },
      in: (...args: unknown[]) => {
        entry.ops.push({ method: 'in', args });
        return chain;
      },
      or: (...args: unknown[]) => {
        entry.ops.push({ method: 'or', args });
        return chain;
      },
      order: (...args: unknown[]) => {
        entry.ops.push({ method: 'order', args });
        return chain;
      },
      limit: (...args: unknown[]) => {
        entry.ops.push({ method: 'limit', args });
        return chain;
      },
      range: (...args: unknown[]) => {
        entry.ops.push({ method: 'range', args });
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
      refreshSession: async () => ({ data: { session: null, user: null }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal2', nextLevel: 'aal2' },
          error: null,
        }),
        listFactors: async () => ({
          data: {
            all: [{ id: 'totp-1', factor_type: 'totp', status: 'verified' }],
            totp: [{ id: 'totp-1', factor_type: 'totp', status: 'verified' }],
          },
          error: null,
        }),
        enroll: async () => ({ data: null, error: null }),
        unenroll: async () => ({ data: null, error: null }),
        challengeAndVerify: async () => ({ data: null, error: null }),
      },
    },
    from,
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      recordedRpcs.push({ fn, args });
      return rpcResponder ? rpcResponder(fn, args) : { data: null, error: null };
    },
  };

  return {
    client: client as unknown as ConstructorParameters<typeof SupabaseAdminApi>[0],
    recorded,
    recordedRpcs,
  };
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

test('SupabaseAdminApi uses real DB columns for audit_log (at/entity), device_sessions (user_id), quick_answers (option_id), and exam_results', async () => {
  const { client, recorded } = createFakeSupabaseClient((q) => {
    if (q.table === 'audit_log') {
      return {
        data: [
          {
            id: 42,
            at: '2026-03-01T12:00:00Z',
            actor_id: 'staff-user-1',
            action: 'approve_payment',
            entity: 'payment_requests',
            entity_id: 'pay-1',
            details: { amount: 250 },
          },
        ],
        count: 1,
        error: null,
      };
    }
    if (q.table === 'staff_profiles') {
      return { data: [{ user_id: 'staff-user-1', full_name: 'أحمد الإداري' }], error: null };
    }
    if (q.table === 'device_sessions') {
      return {
        data: [
          {
            id: 'ds-1',
            user_id: 'stu-1',
            auth_session_id: 'as-1',
            device_id: 'android-xyz',
            platform: 'android',
            started_at: '2026-02-01T08:00:00Z',
            last_seen_at: '2026-02-10T08:00:00Z',
            ended_at: null,
            end_reason: null,
          },
        ],
        error: null,
      };
    }
    if (q.table === 'allowed_link_domains') {
      return { data: { domain: 'youtube.com', kind: 'video', created_at: '2026-01-01T00:00:00Z' }, error: null };
    }
    if (q.table === 'item_progress') {
      return {
        data: [
          {
            student_id: 'stu-1',
            item_id: 'item-1',
            status: 'completed',
            completed_at: '2026-02-01T10:00:00Z',
            updated_at: '2026-02-01T10:00:00Z',
          },
        ],
        error: null,
      };
    }
    if (q.table === 'lesson_items') {
      return { data: [{ id: 'item-1', title: 'شرح 1', lesson_id: 'les-1' }], error: null };
    }
    if (q.table === 'lessons') {
      return { data: [{ id: 'les-1', title: 'الدرس الأول' }], error: null };
    }
    if (q.table === 'quick_answers') {
      return {
        data: [
          {
            student_id: 'stu-1',
            question_id: 'qq-1',
            option_id: 'opt-1',
            is_correct: true,
            attempts: 1,
            answered_at: '2026-02-01T10:05:00Z',
          },
        ],
        error: null,
      };
    }
    if (q.table === 'quick_questions') {
      return { data: [{ id: 'qq-1', prompt: 'سؤال؟' }], error: null };
    }
    if (q.table === 'quick_question_options') {
      return { data: [{ id: 'opt-1', text: 'إجابة أ' }], error: null };
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
            graded_by_ai: false,
            computed_at: '2026-02-02T12:00:00Z',
          },
        ],
        error: null,
      };
    }
    if (q.table === 'exams') {
      return { data: [{ id: 'ex-1', title: 'اختبار الشهر' }], error: null };
    }
    return { data: [], error: null };
  });

  const api = new SupabaseAdminApi(client);

  // Audit log query uses `at` & `entity`
  const auditRes = await api.getAuditLog({
    entityType: 'payment_requests',
    fromDate: '2026-03-01T00:00:00Z',
  });
  assert.equal(auditRes.items[0]?.entity_type, 'payment_requests');
  assert.equal(auditRes.items[0]?.created_at, '2026-03-01T12:00:00Z');
  assert.equal(auditRes.items[0]?.actor_name, 'أحمد الإداري');
  const auditQ = recorded.find((q) => q.table === 'audit_log');
  assert.ok(auditQ?.ops.some((o) => o.method === 'order' && o.args[0] === 'at'));
  assert.ok(auditQ?.ops.some((o) => o.method === 'eq' && o.args[0] === 'entity'));
  assert.ok(auditQ?.ops.some((o) => o.method === 'gte' && o.args[0] === 'at'));

  // Device sessions filter by `user_id`
  const devices = await api.getStudentDevices('stu-1');
  assert.equal(devices[0]?.student_id, 'stu-1');
  assert.equal(devices[0]?.is_active, true);
  assert.equal(devices[0]?.created_at, '2026-02-01T08:00:00Z');
  const devQ = recorded.find((q) => q.table === 'device_sessions');
  assert.ok(devQ?.ops.some((o) => o.method === 'eq' && o.args[0] === 'user_id' && o.args[1] === 'stu-1'));

  // Allowed domains update/delete by `domain` without `is_active`
  const updated = await api.updateAllowedLinkDomain('youtube.com', {
    domain: 'youtube.com',
    kind: 'video',
    is_active: true,
  });
  assert.equal(updated.id, 'youtube.com');
  await api.deleteAllowedLinkDomain('youtube.com');

  const activity = await api.getStudentActivity('stu-1');
  assert.equal(activity.progress[0]?.lesson_title, 'الدرس الأول');
  assert.equal(activity.quickAnswers[0]?.selected_option_text, 'إجابة أ');

  const exams = await api.getStudentExams('stu-1');
  assert.equal(exams.results[0]?.id, 'att-99');
  assert.equal(exams.results[0]?.percentage, 75);
  assert.equal(exams.results[0]?.exam_title, 'اختبار الشهر');
});

test('SupabaseAdminApi RPC calls use exact p_... signatures and map return values accurately', async () => {
  const { client, recordedRpcs } = createFakeSupabaseClient(
    (q) => {
      if (q.table === 'grading_batches') {
        return {
          data: {
            id: 'batch-1',
            exam_id: 'ex-1',
            status: 'exported',
            exported_by: 'staff-1',
            exported_at: '2026-03-01T00:00:00Z',
            imported_at: null,
            ai_graded: false,
            rows_imported: 12,
          },
          error: null,
        };
      }
      if (q.table === 'exam_questions') {
        return { data: [{ id: 'q-1', prompt_html: '<p>ما هو؟</p>' }], error: null };
      }
      if (q.table === 'subscriptions') {
        return {
          data: {
            id: 'sub-1',
            student_id: 'stu-1',
            track_id: 1,
            term_id: 2,
            price_paid_egp: 200,
            starts_at: '2026-03-01T00:00:00Z',
            ends_at: '2026-07-01T00:00:00Z',
            status: 'active',
            payment_request_id: null,
            created_by: 'staff-1',
            note: 'منحة',
            created_at: '2026-03-01T00:00:00Z',
          },
          error: null,
        };
      }
      if (q.table === 'announcements') {
        return {
          data: {
            id: 'ann-1',
            title: 'تنبيه هام',
            body: 'محتوى',
            track_id: 1,
            governorate_id: 3,
            recipients: 50,
            created_by: 'staff-1',
            created_at: '2026-03-01T00:00:00Z',
          },
          error: null,
        };
      }
      if (q.table === 'year_end_reports') {
        return {
          data: {
            id: 'yer-1',
            student_id: 'stu-1',
            academic_year: '2025-2026',
            pdf_path: 'reports/2025-2026.pdf',
            generated_at: '2026-06-01T00:00:00Z',
            details_deleted_at: null,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    (fn) => {
      if (fn === 'export_grading') {
        return {
          data: [
            {
              batch_id: 'batch-1',
              answer_code: 'CODE-1',
              question_position: 2,
              question_text: 'اشرح؟',
              answer_text: 'إجابة',
              max_points: 10,
              current_score: 7,
            },
          ],
          error: null,
        };
      }
      if (fn === 'question_stats') {
        return {
          data: [
            {
              question_id: 'q-1',
              q_position: 1,
              type: 'mcq',
              points: 5,
              attempts: 20,
              answered: 18,
              correct: 15,
              pct_correct: 83.3,
              avg_essay: null,
            },
          ],
          error: null,
        };
      }
      if (fn === 'grant_subscription') return { data: 'sub-1', error: null };
      if (fn === 'send_announcement') return { data: 50, error: null };
      if (fn === 'register_year_end_report') return { data: 'yer-1', error: null };
      if (fn === 'purge_year_end_details') return { data: 120, error: null };
      return { data: null, error: null };
    }
  );

  const api = new SupabaseAdminApi(client);

  await api.extendTrial('stu-1', 7);
  await api.setStudentBlocked('stu-1', true, 'مخالفة');
  await api.changeStudentTrack('stu-1', '2');
  await api.updateStudentLocation('stu-1', '3', '14');
  await api.resetStudentSession('stu-1');

  const sub = await api.grantSubscription({
    student_id: 'stu-1',
    term_id: '2',
    ends_at: '2026-07-01T00:00:00Z',
    note: 'منحة',
  });
  assert.equal(sub.id, 'sub-1');
  assert.equal(sub.grant_note, 'منحة');

  const exported = await api.exportGrading('ex-1');
  assert.equal(exported.batch.id, 'batch-1');
  assert.equal(exported.batch.rows_count, 12);
  assert.equal(exported.rows[0]?.score, 7);

  await api.importGrades('batch-1', [{ answer_code: 'CODE-1', question_position: 2, score: 8 }], true);
  const qStats = await api.getQuestionStats('ex-1');
  assert.equal(qStats[0]?.position, 1);
  assert.equal(qStats[0]?.question_type, 'mcq');
  assert.equal(qStats[0]?.prompt_html, '<p>ما هو؟</p>');

  const ann = await api.sendAnnouncement({
    title: 'تنبيه هام',
    body: 'محتوى',
    track_id: '1',
    governorate_id: '3',
  });
  assert.equal(ann.recipients_count, 50);

  const yer = await api.registerYearEndReport('2025-2026', 'reports/2025-2026.pdf', 'stu-1');
  assert.equal(yer.id, 'yer-1');
  const purged = await api.purgeYearEndDetails('2025-2026', 'DELETE');
  assert.equal(purged, 120);

  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'extend_trial')?.args, { p_student: 'stu-1', p_days: 7 });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'set_student_blocked')?.args, {
    p_student: 'stu-1',
    p_blocked: true,
    p_reason: 'مخالفة',
  });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'change_student_track')?.args, {
    p_student: 'stu-1',
    p_track: 2,
  });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'update_student_location')?.args, {
    p_student: 'stu-1',
    p_governorate: 3,
    p_administration: 14,
  });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'reset_student_session')?.args, { p_student: 'stu-1' });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'grant_subscription')?.args, {
    p_student: 'stu-1',
    p_term: 2,
    p_ends_at: '2026-07-01T00:00:00Z',
    p_note: 'منحة',
  });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'import_grades')?.args, {
    p_batch_id: 'batch-1',
    p_rows: [{ answer_code: 'CODE-1', question_position: 2, score: 8 }],
    p_ai: true,
  });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'send_announcement')?.args, {
    p_title: 'تنبيه هام',
    p_body: 'محتوى',
    p_track: 1,
    p_governorate: 3,
  });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'register_year_end_report')?.args, {
    p_student: 'stu-1',
    p_year: '2025-2026',
    p_pdf_path: 'reports/2025-2026.pdf',
  });
  assert.deepEqual(recordedRpcs.find((r) => r.fn === 'purge_year_end_details')?.args, {
    p_year: '2025-2026',
    p_confirm: 'DELETE',
  });
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

test('SupabaseAdminApi MFA enrollment cleans up unverified leftovers, enrolls QR+secret, and verifies via challengeAndVerify to AAL2', async () => {
  let currentLevel: 'aal1' | 'aal2' = 'aal1';
  let nextLevel: 'aal1' | 'aal2' = 'aal1';
  const factorsState: Array<{ id: string; factor_type: 'totp'; status: 'verified' | 'unverified' }> = [
    { id: 'stale-unverified-1', factor_type: 'totp', status: 'unverified' },
  ];
  const calls: string[] = [];

  const mockSb = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: 'admin-1', email: 'admin@example.com' } } },
        error: null,
      }),
      signInWithPassword: async () => ({ error: null }),
      refreshSession: async () => {
        calls.push('refreshSession');
        return { data: { session: null, user: null }, error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => {
          calls.push('getAuthenticatorAssuranceLevel');
          return { data: { currentLevel, nextLevel }, error: null };
        },
        listFactors: async () => {
          calls.push('listFactors');
          return {
            data: {
              all: [...factorsState],
              totp: factorsState.filter((f) => f.status === 'verified'),
            },
            error: null,
          };
        },
        unenroll: async ({ factorId }: { factorId: string }) => {
          calls.push(`unenroll:${factorId}`);
          const idx = factorsState.findIndex((f) => f.id === factorId);
          if (idx >= 0) factorsState.splice(idx, 1);
          return { data: { id: factorId }, error: null };
        },
        enroll: async (params: { factorType: string; friendlyName: string }) => {
          calls.push(`enroll:${params.factorType}:${params.friendlyName}`);
          factorsState.push({ id: 'fresh-totp-1', factor_type: 'totp', status: 'unverified' });
          return {
            data: {
              id: 'fresh-totp-1',
              type: 'totp',
              totp: {
                qr_code: 'data:image/svg+xml;utf-8,<svg></svg>',
                secret: 'SECRETBASE32KEY',
                uri: 'otpauth://totp/Admin?secret=SECRETBASE32KEY',
              },
            },
            error: null,
          };
        },
        challengeAndVerify: async ({ factorId, code }: { factorId: string; code: string }) => {
          calls.push(`challengeAndVerify:${factorId}:${code}`);
          const f = factorsState.find((x) => x.id === factorId);
          if (f) f.status = 'verified';
          currentLevel = 'aal2';
          nextLevel = 'aal2';
          return { data: { access_token: 'aal2-jwt' }, error: null };
        },
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === 'staff_profiles'
              ? {
                  data: {
                    user_id: 'admin-1',
                    full_name: 'مدير',
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-01T00:00:00Z',
                  },
                  error: null,
                }
              : { data: null, error: null },
          then: (fn: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ role: 'admin' }], error: null }).then(fn),
        }),
      }),
    }),
  } as unknown as ConstructorParameters<typeof SupabaseAdminApi>[0];

  const api = new SupabaseAdminApi(mockSb);

  const initialSession = await api.signIn('admin@example.com', 'pw');
  assert.equal(initialSession.mfaRequired, true);
  assert.equal(initialSession.mfaEnrolled, false);
  assert.equal(initialSession.mfaVerified, false);

  const enrolled = await api.enrollMfa();
  assert.equal(enrolled.factorId, 'fresh-totp-1');
  assert.equal(enrolled.secret, 'SECRETBASE32KEY');
  assert.ok(enrolled.qrCode.startsWith('data:image/svg+xml'));
  assert.ok(calls.includes('unenroll:stale-unverified-1'));
  assert.ok(calls.includes('enroll:totp:Admin'));

  const verified = await api.verifyMfa('654321', enrolled.factorId);
  assert.ok(calls.includes('challengeAndVerify:fresh-totp-1:654321'));
  assert.ok(calls.includes('refreshSession'));
  assert.equal(verified.mfaEnrolled, true);
  assert.equal(verified.mfaVerified, true);
  assert.equal(verified.aalCurrentLevel, 'aal2');
});

test('SupabaseAdminApi allows non-MFA roles (content/support/exams/grader/students_manager) to log in at AAL1 without MFA', async () => {
  for (const role of ['content', 'exams', 'grader', 'students_manager', 'support'] as const) {
    const mockSb = {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: `u-${role}`, email: `${role}@example.com` } } },
          error: null,
        }),
        signInWithPassword: async () => ({ error: null }),
        mfa: {
          getAuthenticatorAssuranceLevel: async () => ({
            data: { currentLevel: 'aal1', nextLevel: 'aal1' },
            error: null,
          }),
          listFactors: async () => ({ data: { all: [], totp: [] }, error: null }),
        },
      },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              table === 'staff_profiles'
                ? {
                    data: {
                      user_id: `u-${role}`,
                      full_name: role,
                      created_at: '2026-01-01T00:00:00Z',
                      updated_at: '2026-01-01T00:00:00Z',
                    },
                    error: null,
                  }
                : { data: null, error: null },
            then: (fn: (v: unknown) => unknown) =>
              Promise.resolve({ data: [{ role }], error: null }).then(fn),
          }),
        }),
      }),
    } as unknown as ConstructorParameters<typeof SupabaseAdminApi>[0];

    const api = new SupabaseAdminApi(mockSb);
    const sess = await api.signIn(`${role}@example.com`, 'pw');
    assert.equal(sess.mfaRequired, false);
    assert.equal(sess.mfaVerified, true);
    assert.equal(sess.mfaEnrolled, false);
  }
});

test('normalizeQrDataUri encodes unencoded SVG data URIs containing # colors without double-encoding', () => {
  const unencoded =
    'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000"/></svg>';
  const normalized = normalizeQrDataUri(unencoded);
  assert.ok(normalized.startsWith('data:image/svg+xml;utf-8,%3Csvg'));
  assert.ok(!normalized.includes('#'));
  assert.equal(normalizeQrDataUri(normalized), normalized);
});
