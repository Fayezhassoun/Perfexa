// Deterministic intent detection (CONTRACTS §8 item 3). Keyword-based, ordered
// canonically: seo, visibility, leads, ads_google, ads_meta, ads_tiktok,
// analytics, budget_change, pause.

import type { Intent } from './types.js';

const KEYWORDS: Record<Intent, RegExp> = {
  seo: /\bseo\b|search engine|organic (traffic|search|rank)|google ranking|search rank/i,
  visibility: /visib|more visitors|more traffic|get found|top of google|first page/i,
  leads: /\bleads?\b|get (more )?(customers|clients)|new customers|contact form|sign ?ups?|more (calls|enquiries|inquiries)/i,
  ads_google: /google ads|adwords|search ads|google campaign|paid search|\bsem\b/i,
  ads_meta: /meta ads|facebook ads|instagram ads|\bfacebook\b|\binstagram\b/i,
  ads_tiktok: /tik\s?tok/i,
  analytics: /how (did|are) we (do|doing)|performance|results|report|analytics|how('s| is) it going/i,
  budget_change: /budget|spend|raise|increase|decrease|reduce|move .* (budget|money)/i,
  pause: /\bpause\b|\bstop\b|\bhalt\b|\bsuspend\b/i,
  social: /social media|\bpost\b|\bposts\b|\binstagram\b|\blinkedin\b|\btweet\b|\bx\.com\b|social presence|content calendar/i,
  content: /\bblog\b|write (an? )?(article|post|copy)|content (studio|ideas|plan)|ad copy|caption/i,
  competitor: /\bcompetitors?\b|\brivals?\b|who am i up against|compare (me|us) (to|with)/i,
  reviews: /\breviews?\b|\breputation\b|\bratings?\b|google business|testimonials?/i,
};

const ORDER: Intent[] = ['seo', 'visibility', 'leads', 'ads_google', 'ads_meta', 'ads_tiktok', 'analytics', 'budget_change', 'pause', 'social', 'content', 'competitor', 'reviews'];

export function detectIntents(message: string): Intent[] {
  return ORDER.filter((intent) => KEYWORDS[intent].test(message));
}

/** "Chicago area, yes $500 is fine." → "Chicago". "in Austin" → "Austin". */
export function detectGeography(message: string): string | undefined {
  const area = message.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+area\b/);
  if (area?.[1]) return area[1];
  const inMatch = message.match(/\b(?:in|around|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (inMatch?.[1] && !/^(The|Yes|This|That)$/i.test(inMatch[1])) return inMatch[1];
  return undefined;
}

/** "$500" → 50000; "500 dollars" → 50000; "2k" → 200000. */
export function detectBudgetAmountCents(message: string): number | undefined {
  const dollar = message.match(/\$\s?(\d[\d,]*)/);
  if (dollar?.[1]) return Number(dollar[1].replace(/,/g, '')) * 100;
  const words = message.match(/\b(\d[\d,]*)\s?(dollars|usd|bucks)\b/i);
  if (words?.[1]) return Number(words[1].replace(/,/g, '')) * 100;
  const k = message.match(/\b(\d+(?:\.\d+)?)\s?k\b/i);
  if (k?.[1]) return Math.round(Number(k[1]) * 1000) * 100;
  return undefined;
}

export function detectBudgetConfirmation(message: string): boolean {
  return /\b(yes|ok|okay|fine|sounds good|works( for me)?|sure|agreed?|that works|good)\b/i.test(message);
}

/** Only evaluated when a proposal is pending (orchestrator short-circuit). */
export const APPROVE_RE = /^\s*(approve|approved|i approve|yes approve|go ahead|launch it|launch|let'?s go|do it)[\s!.]*$/i;
export const REJECT_RE = /^\s*(cancel|reject|decline|no thanks|nope|don'?t|stop)[\s!.]*$/i;

/** "pause tiktok" / "pause the Google campaign" → platform */
export function detectPausePlatform(message: string): 'google_ads' | 'meta' | 'tiktok' | undefined {
  if (!/\bpause\b/i.test(message)) return undefined;
  if (/google|adwords|search/i.test(message)) return 'google_ads';
  if (/meta|facebook|instagram/i.test(message)) return 'meta';
  if (/tik\s?tok/i.test(message)) return 'tiktok';
  return undefined;
}
