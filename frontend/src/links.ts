import { find } from 'linkifyjs';
export type DetectedLink = { start: number; end: number; text: string; url: string };
// Linkify uses real domain suffixes; a dot alone is not enough (emails/files/decimals stay text).
export function detectedLinks(text: string): DetectedLink[] {
  return find(text).flatMap((link) => {
    if (
      link.type !== 'url' ||
      (/^[a-z][a-z0-9+.-]*:/i.test(link.value) && !/^https?:\/\//i.test(link.value))
    )
      return [];
    try {
      const value = /^https?:\/\//i.test(link.value) ? link.value : 'https://' + link.value;
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.port ||
        url.href.length > 2048 ||
        !host.includes('.') ||
        host.startsWith('[') ||
        /^[0-9.]+$/.test(host) ||
        /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(host)
      )
        return [];
      return [{ start: link.start, end: link.end, text: link.value, url: url.href }];
    } catch {
      return [];
    }
  });
}
