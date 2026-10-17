// ==========================================================================
// VUNA Life — email domain whitelist
// HARD RULE (user-specified): never guess the school's email domain. Read the
// allowed list from config (key: allowed_email_domains). EMPTY list = CLOSED.
// Treat any example domain as an unverified guess.
// ==========================================================================

export type EmailCheckResult =
  | { ok: true; domain: string }
  | { ok: false; reason: 'malformed' | 'domain_not_allowed' | 'no_domain' | 'closed' };

/**
 * Parse the raw config value into a normalised set of lowercased domains.
 * The config value may be:
 *   - A JSON array string: '["veritas.edu.ng","students.veritas.edu.ng"]'
 *   - A comma-separated string: "veritas.edu.ng,students.veritas.edu.ng"
 *   - An empty string or null/undefined -> empty set
 * Whitespace and case are normalised.
 */
export function parseAllowedDomains(raw: unknown): Set<string> {
  if (raw == null) return new Set();

  // Already an array (e.g. parsed JSON)
  if (Array.isArray(raw)) {
    return new Set(
      raw
        .filter((d): d is string => typeof d === 'string')
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d.length > 0),
    );
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return new Set();

    // JSON array
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return new Set(
            parsed
              .filter((d): d is string => typeof d === 'string')
              .map((d) => d.trim().toLowerCase())
              .filter((d) => d.length > 0),
          );
        }
      } catch {
        // Fall through to comma-split.
      }
    }

    // Comma-separated
    return new Set(
      trimmed
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d.length > 0),
    );
  }

  return new Set();
}

/**
 * Check whether an email passes the domain whitelist.
 *
 * Returns:
 *   - { ok: true, domain } if the email is well-formed AND its domain is on the list.
 *   - { ok: false, reason: 'malformed' } if the email is not a valid email shape.
 *   - { ok: false, reason: 'no_domain' } if the email has no domain part.
 *   - { ok: false, reason: 'closed' } if the whitelist is empty (verification closed).
 *   - { ok: false, reason: 'domain_not_allowed' } if the domain is not on the list.
 *
 * The check is intentionally strict:
 *   - We do NOT allow subdomain wildcarding. If 'veritas.edu.ng' is on the list,
 *     'student@sub.veritas.edu.ng' is rejected unless 'sub.veritas.edu.ng' is also
 *     explicitly listed. This avoids accidental over-permission.
 *   - We do NOT do MX lookup or any network call. Just a string match against the
 *     configured list.
 *   - The local part of the email is ignored; only the domain matters here.
 */
export function checkEmailDomain(email: string, allowedDomains: Set<string>): EmailCheckResult {
  if (typeof email !== 'string') return { ok: false, reason: 'malformed' };
  const trimmed = email.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'malformed' };
  if (trimmed.length > 254) return { ok: false, reason: 'malformed' };

  const atCount = (trimmed.match(/@/g) ?? []).length;
  if (atCount !== 1) return { ok: false, reason: 'malformed' };

  const [local, domainRaw] = trimmed.split('@');
  if (!local || local.length === 0) return { ok: false, reason: 'malformed' };
  if (local.length > 64) return { ok: false, reason: 'malformed' };
  if (/[\s\x00-\x1f]/.test(local)) return { ok: false, reason: 'malformed' };

  if (!domainRaw || domainRaw.length === 0) return { ok: false, reason: 'no_domain' };
  if (domainRaw.length > 253) return { ok: false, reason: 'malformed' };

  const labels = domainRaw.split('.');
  if (labels.length < 2) return { ok: false, reason: 'malformed' };
  for (const label of labels) {
    if (label.length === 0) return { ok: false, reason: 'malformed' };
    if (label.length > 63) return { ok: false, reason: 'malformed' };
    if (!/^[a-z0-9-]+$/i.test(label)) return { ok: false, reason: 'malformed' };
    if (label.startsWith('-') || label.endsWith('-')) return { ok: false, reason: 'malformed' };
  }

  const domain = domainRaw.toLowerCase();

  // CLOSED if list is empty.
  if (allowedDomains.size === 0) return { ok: false, reason: 'closed' };

  if (allowedDomains.has(domain)) {
    return { ok: true, domain };
  }
  return { ok: false, reason: 'domain_not_allowed' };
}

/**
 * Human-readable reason text, for surfacing in the UI without leaking which
 * specific domains are allowed (so a probe cannot learn the whitelist by
 * guessing). Only 'closed' and 'domain_not_allowed' collapse to the same text
 * in the public message; the internal reason is still returned for telemetry.
 */
export function publicRejectionReason(r: EmailCheckResult): string {
  if (r.ok) return '';
  switch (r.reason) {
    case 'malformed':
      return 'That email does not look right. Please check the address and try again.';
    case 'no_domain':
      return 'That email does not look right. Please check the address and try again.';
    case 'closed':
      return 'Sign-up is currently closed. Please contact the school administration.';
    case 'domain_not_allowed':
      return 'Sign-up is currently closed. Please contact the school administration.';
  }
}
