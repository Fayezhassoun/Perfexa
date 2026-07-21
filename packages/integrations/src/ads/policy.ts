// Shared ad-copy policy pre-flight heuristic — used identically by the mock
// and live adapters so copy that passes sandbox doesn't surprise users live.
// (Real platform review still happens server-side at Google/Meta; this is a
// fast, deterministic first pass.)

export function checkAdCopyPolicy(adCopy: { headline: string; body: string }): {
  ok: boolean;
  violations: string[];
} {
  const text = `${adCopy.headline} ${adCopy.body}`;
  const violations: string[] = [];
  const capsWords = text.match(/\b[A-Z]{4,}\b/g) ?? [];
  if (capsWords.length >= 3) violations.push('Excessive capitalization (3+ all-caps words).');
  if (/guarantee[ds]?\b/i.test(text)) violations.push('"Guaranteed" claims are not allowed.');
  if (/free money/i.test(text)) violations.push('"Free money" claims are prohibited.');
  if (/click here/i.test(text)) violations.push('"Click here" is flagged as low-quality copy.');
  if (/100% (off|free)/i.test(text)) violations.push('Absolute discount claims may be rejected.');
  if (/!{3,}/.test(text)) violations.push('Excessive exclamation marks.');
  return { ok: violations.length === 0, violations };
}
