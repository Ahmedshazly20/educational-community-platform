import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeArticleHtml } from './sanitize';

test('strips script tags, event handlers, and foreign-host images while keeping content-media images', () => {
  const dirty = [
    '<h2>عنوان الدرس</h2>',
    '<p onclick="alert(1)">نص <script>alert("xss")</script>تجريبي</p>',
    '<img src="https://evil.com/hack.png" onerror="alert(1)" />',
    '<img src="https://proj.supabase.co/storage/v1/object/public/content-media/article/1/pic.png" alt="صورة" />',
    '<a href="javascript:alert(1)">خطير</a>',
    '<a href="https://drive.google.com/doc">رابط آمن</a>',
  ].join('');

  const clean = sanitizeArticleHtml(dirty, ['proj.supabase.co']);
  assert.equal(clean.includes('<script'), false);
  assert.equal(clean.includes('onerror'), false);
  assert.equal(clean.includes('onclick'), false);
  assert.equal(clean.includes('evil.com'), false);
  assert.equal(clean.includes('javascript:'), false);
  assert.equal(clean.includes('proj.supabase.co/storage/v1/object/public/content-media/'), true);
  assert.equal(clean.includes('https://drive.google.com/doc'), true);
});
