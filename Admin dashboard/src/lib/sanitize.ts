import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'a',
  'img',
  'br',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'title'];

export function isAllowedContentMediaSrc(
  src: string,
  allowedHosts: ReadonlyArray<string> = []
): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  // Allow mock local data URLs only when explicitly marked or from mock-media
  if (trimmed.startsWith('data:image/png;base64,') || trimmed.startsWith('data:image/jpeg;base64,') || trimmed.startsWith('data:image/webp;base64,')) {
    return allowedHosts.includes('__mock_data_url__');
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') return false;
    const hostMatch = allowedHosts.some((h) => url.hostname.toLowerCase() === h.toLowerCase());
    const hasContentMediaPath = url.pathname.includes('/content-media/');
    return hostMatch && hasContentMediaPath;
  } catch {
    return false;
  }
}

export function isAllowedHttpsHref(href: string): boolean {
  try {
    const url = new URL(href.trim());
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getDefaultAllowedHosts(): string[] {
  const hosts: string[] = [];
  const supabaseUrl =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_SUPABASE_URL as string | undefined)
      : undefined;
  if (supabaseUrl) {
    try {
      hosts.push(new URL(supabaseUrl).hostname.toLowerCase());
    } catch {
      // ignore invalid env URL
    }
  }
  const mode =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_DATA_MODE as string | undefined)
      : 'mock';
  if (mode !== 'supabase') {
    hosts.push('mock.content-media.local', '__mock_data_url__');
  }
  return hosts;
}

export function sanitizeArticleHtml(
  dirtyHtml: string,
  allowedImageHosts: ReadonlyArray<string> = getDefaultAllowedHosts()
): string {
  if (!dirtyHtml) return '';

  if (typeof window !== 'undefined' && DOMPurify.isSupported) {
    const parser = new DOMParser();
    const cleaned = DOMPurify.sanitize(dirtyHtml, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'input'],
    });

    const doc = parser.parseFromString(cleaned, 'text/html');
    doc.querySelectorAll('a').forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      if (!isAllowedHttpsHref(href)) {
        anchor.removeAttribute('href');
      } else {
        anchor.setAttribute('rel', 'noopener noreferrer');
        anchor.setAttribute('target', '_blank');
      }
    });

    doc.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') ?? '';
      if (!isAllowedContentMediaSrc(src, allowedImageHosts)) {
        img.remove();
      }
    });

    return doc.body.innerHTML;
  }

  // Deterministic non-DOM fallback (e.g. Node unit tests)
  let out = dirtyHtml
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Strip disallowed tags while keeping text inside safe structural tags
  out = out.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (full, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) return '';
    if (full.startsWith('</')) return `</${tag}>`;

    if (tag === 'a') {
      const hrefMatch = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? '';
      if (!isAllowedHttpsHref(href)) return '<a>';
      return `<a href="${href}" rel="noopener noreferrer" target="_blank">`;
    }

    if (tag === 'img') {
      const srcMatch = attrs.match(/src\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const src = srcMatch?.[1] ?? srcMatch?.[2] ?? '';
      if (!isAllowedContentMediaSrc(src, allowedImageHosts)) return '';
      const altMatch = attrs.match(/alt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const alt = altMatch?.[1] ?? altMatch?.[2] ?? '';
      return `<img src="${src}" alt="${alt}">`;
    }

    return `<${tag}>`;
  });

  return out;
}
