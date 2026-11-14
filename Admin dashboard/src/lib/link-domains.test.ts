import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLinkAgainstAllowedDomains } from './link-domains';
import type { AllowedLinkDomain } from '../data/types';

const DOMAINS: AllowedLinkDomain[] = [
  { id: '1', domain: 'youtube.com', kind: 'video', is_active: true },
  { id: '2', domain: 'drive.google.com', kind: 'document', is_active: true },
  { id: '3', domain: 'vimeo.com', kind: 'video', is_active: false },
];

test('rejects non-HTTPS links with LINK_MUST_BE_HTTPS', () => {
  const res = checkLinkAgainstAllowedDomains('http://youtube.com/watch?v=123', DOMAINS);
  assert.equal(res.errorCode, 'LINK_MUST_BE_HTTPS');
});

test('rejects lookalike subdomain attack youtube.com.evil.com', () => {
  const res = checkLinkAgainstAllowedDomains('https://youtube.com.evil.com/watch?v=1', DOMAINS);
  assert.equal(res.errorCode, 'LINK_DOMAIN_NOT_ALLOWED');
});

test('accepts valid YouTube video link with androidOnly=true and Drive doc with androidOnly=false', () => {
  const yt = checkLinkAgainstAllowedDomains('https://www.youtube.com/watch?v=abc', DOMAINS);
  assert.equal(yt.errorCode, null);
  assert.equal(yt.inferredKind, 'video');
  assert.equal(yt.androidOnly, true);

  const drive = checkLinkAgainstAllowedDomains('https://drive.google.com/file/d/xyz/view', DOMAINS);
  assert.equal(drive.errorCode, null);
  assert.equal(drive.inferredKind, 'document');
  assert.equal(drive.androidOnly, false);
});

test('rejects inactive domain', () => {
  const res = checkLinkAgainstAllowedDomains('https://vimeo.com/123', DOMAINS);
  assert.equal(res.errorCode, 'LINK_DOMAIN_NOT_ALLOWED');
});
