// Lightweight keyword sentiment for reviews. Deterministic and offline —
// swappable for an LLM call when a live provider is configured.

export type Sentiment = 'positive' | 'neutral' | 'negative';

const POSITIVE =
  /\b(great|excellent|amazing|awesome|love|loved|fantastic|wonderful|perfect|friendly|helpful|recommend|recommended|best|quick|fast|professional|happy|pleased|outstanding|superb|delicious|clean|reliable)\b/gi;

const NEGATIVE =
  /\b(bad|terrible|awful|horrible|worst|rude|slow|late|dirty|broken|scam|refund|never again|disappointed|disappointing|poor|unprofessional|overpriced|waste|ignored|cancelled|damaged|unhelpful)\b/gi;

export function analyzeSentiment(text: string): Sentiment {
  const pos = (text.match(POSITIVE) ?? []).length;
  const neg = (text.match(NEGATIVE) ?? []).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

/** Ratings dominate words when present (a 1★ "great scam" is negative). */
export function sentimentForReview(content: string, rating?: number | null): Sentiment {
  if (rating != null) {
    if (rating >= 4) return 'positive';
    if (rating <= 2) return 'negative';
  }
  return analyzeSentiment(content);
}
