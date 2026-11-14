import type { AllowedLinkDomain, LinkKind } from '../data/types';

export interface LinkDomainMatchResult {
  validHttps: boolean;
  hostname: string | null;
  matchedDomain: AllowedLinkDomain | null;
  inferredKind: LinkKind | null;
  androidOnly: boolean;
  errorCode: 'LINK_MUST_BE_HTTPS' | 'LINK_DOMAIN_NOT_ALLOWED' | null;
}

export function normalizeDomainString(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '');
}

export function checkLinkAgainstAllowedDomains(
  rawUrl: string,
  allowedDomains: ReadonlyArray<AllowedLinkDomain>
): LinkDomainMatchResult {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      validHttps: false,
      hostname: null,
      matchedDomain: null,
      inferredKind: null,
      androidOnly: false,
      errorCode: 'LINK_MUST_BE_HTTPS',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      validHttps: false,
      hostname: parsed.hostname.toLowerCase(),
      matchedDomain: null,
      inferredKind: null,
      androidOnly: false,
      errorCode: 'LINK_MUST_BE_HTTPS',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const activeDomains = allowedDomains.filter((d) => d.is_active);

  const matched = activeDomains.find((d) => {
    const allowed = normalizeDomainString(d.domain);
    return host === allowed || host.endsWith(`.${allowed}`);
  });

  if (!matched) {
    return {
      validHttps: true,
      hostname: host,
      matchedDomain: null,
      inferredKind: null,
      androidOnly: false,
      errorCode: 'LINK_DOMAIN_NOT_ALLOWED',
    };
  }

  return {
    validHttps: true,
    hostname: host,
    matchedDomain: matched,
    inferredKind: matched.kind,
    androidOnly: matched.kind === 'video',
    errorCode: null,
  };
}
