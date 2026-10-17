// ==========================================================================
// VUNA Life — tests for src/lib/auth/email-domain-check.ts
// Run with: bun test tests/email-domain-check.test.ts
//
// HARD RULE enforced here: any email domain not on the whitelist is rejected.
// Empty whitelist = verification CLOSED (no domain passes, including the
// demo domain).
// ==========================================================================
import { test, expect, describe } from 'bun:test';
import {
  checkEmailDomain,
  parseAllowedDomains,
  publicRejectionReason,
} from '../src/lib/auth/email-domain-check';

describe('parseAllowedDomains', () => {
  test('empty string -> empty set', () => {
    expect(parseAllowedDomains('').size).toBe(0);
  });
  test('null -> empty set', () => {
    expect(parseAllowedDomains(null).size).toBe(0);
  });
  test('undefined -> empty set', () => {
    expect(parseAllowedDomains(undefined).size).toBe(0);
  });
  test('JSON array string', () => {
    const s = parseAllowedDomains('["veritas.edu.ng","students.veritas.edu.ng"]');
    expect(s.size).toBe(2);
    expect(s.has('veritas.edu.ng')).toBe(true);
    expect(s.has('students.veritas.edu.ng')).toBe(true);
  });
  test('comma-separated string', () => {
    const s = parseAllowedDomains('veritas.edu.ng, students.veritas.edu.ng ,  ');
    expect(s.size).toBe(2);
    expect(s.has('veritas.edu.ng')).toBe(true);
    expect(s.has('students.veritas.edu.ng')).toBe(true);
  });
  test('case-insensitive: stored lowercased, so lookups must also be lowercased', () => {
    const s = parseAllowedDomains('Veritas.edu.ng');
    // Stored normalised
    expect(s.has('veritas.edu.ng')).toBe(true);
    // Uppercase lookups do NOT match — caller must normalise first.
    // (This is the documented contract: checkEmailDomain lowercases before lookup.)
    expect(s.has('VERITAS.EDU.NG')).toBe(false);
  });
  test('already-array input', () => {
    const s = parseAllowedDomains(['a.edu.ng', 'b.edu.ng']);
    expect(s.size).toBe(2);
  });
  test('whitespace-only entries filtered', () => {
    const s = parseAllowedDomains('a.edu.ng, ,  , b.edu.ng');
    expect(s.size).toBe(2);
  });
});

describe('checkEmailDomain — empty whitelist', () => {
  const empty = new Set<string>();
  test('any email rejected as closed (not as domain_not_allowed)', () => {
    const r = checkEmailDomain('someone@example.edu.ng', empty);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('closed');
  });
  test('even a sensible-looking school email rejected', () => {
    const r = checkEmailDomain('jane@veritas.edu.ng', empty);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('closed');
  });
  test('demo domain also rejected', () => {
    const r = checkEmailDomain('student.demo@vuna-life.local', empty);
    expect(r.ok).toBe(false);
    // 'local' is a single-label TLD so this is 'malformed' (no dot), which is also a rejection.
    if (!r.ok) expect(['closed','malformed']).toContain(r.reason);
  });
});

describe('checkEmailDomain — non-empty whitelist', () => {
  const list = parseAllowedDomains('["veritas.edu.ng","students.veritas.edu.ng"]');
  test('exact match on first domain', () => {
    const r = checkEmailDomain('jane@veritas.edu.ng', list);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.domain).toBe('veritas.edu.ng');
  });
  test('exact match on second domain', () => {
    const r = checkEmailDomain('jane@students.veritas.edu.ng', list);
    expect(r.ok).toBe(true);
  });
  test('different domain rejected as domain_not_allowed (NOT closed)', () => {
    const r = checkEmailDomain('jane@gmail.com', list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('domain_not_allowed');
  });
  test('subdomain NOT wildcarded', () => {
    // 'mail.veritas.edu.ng' is not on the list — must be rejected.
    const r = checkEmailDomain('jane@mail.veritas.edu.ng', list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('domain_not_allowed');
  });
  test('case-insensitive domain match', () => {
    const r = checkEmailDomain('Jane@Veritas.edu.ng', list);
    expect(r.ok).toBe(true);
  });
});

describe('checkEmailDomain — malformed emails', () => {
  const list = parseAllowedDomains('veritas.edu.ng');
  test('empty string', () => {
    expect(checkEmailDomain('', list).ok).toBe(false);
  });
  test('no @ sign', () => {
    const r = checkEmailDomain('notanemail', list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
  test('two @ signs', () => {
    const r = checkEmailDomain('a@b@c.com', list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
  test('empty local part', () => {
    const r = checkEmailDomain('@veritas.edu.ng', list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
  test('space in local part', () => {
    const r = checkEmailDomain('jane doe@veritas.edu.ng', list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
  test('domain without dot', () => {
    // 'veritas' alone is not a valid domain (needs at least two labels).
    const r = checkEmailDomain('jane@veritas', list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
  test('domain with invalid chars', () => {
    const r = checkEmailDomain('jane@ver itas.edu.ng', list);
    expect(r.ok).toBe(false);
  });
  test('label starting with hyphen', () => {
    const r = checkEmailDomain('jane@-veritas.edu.ng', list);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });
});

describe('publicRejectionReason — no whitelist leakage', () => {
  const list = parseAllowedDomains('veritas.edu.ng');
  test('closed and domain_not_allowed produce the same public message', () => {
    const closed = checkEmailDomain('someone@veritas.edu.ng', new Set());
    const notAllowed = checkEmailDomain('someone@gmail.com', list);
    expect(closed.ok).toBe(false);
    expect(notAllowed.ok).toBe(false);
    expect(publicRejectionReason(closed)).toBe(publicRejectionReason(notAllowed));
  });
  test('malformed produces a different, friendlier message', () => {
    const malformed = checkEmailDomain('garbage', list);
    expect(malformed.ok).toBe(false);
    expect(publicRejectionReason(malformed)).not.toContain('Sign-up is currently closed');
  });
});
