// Mock Google Business reviews adapter: a deterministic per-org review set
// (same org seed → same reviews), timestamps relative to `now`.

import { dateDaysAgo, hashString, pickDeterministic, seededRandom } from './util/hash.js';

export interface ExternalReview {
  externalId: string;
  source: 'google_business';
  author: string;
  rating: number; // 1..5
  content: string;
  createdAt: string; // ISO date
}

const AUTHORS = [
  'Maria G.', 'James T.', 'Priya S.', 'Ahmed K.', 'Linda W.', 'Carlos R.',
  'Sophie B.', 'Daniel O.', 'Yuki N.', 'Fatima A.', 'Tom H.', 'Elena V.',
];

const POSITIVE_TEXTS = [
  'Great service, quick and professional. Would definitely recommend to anyone.',
  'Amazing experience from start to finish. The team was friendly and helpful.',
  'Best in the area, hands down. Fast response and excellent quality.',
  'Very happy with the result. Clean work and fair pricing.',
];

const NEUTRAL_TEXTS = [
  'Decent service overall. Took a bit longer than expected but got the job done.',
  'Okay experience. Communication could be better, but the outcome was fine.',
  'Average. Nothing special, nothing terrible either.',
];

const NEGATIVE_TEXTS = [
  'Disappointed with the service. Slow to respond and the result was poor.',
  'Terrible experience — showed up late and the work was unprofessional.',
  'Overpriced for what you get. Would not use again.',
];

export function fetchMockReviews(orgSeed: string, count = 8, now: Date = new Date()): ExternalReview[] {
  const rand = seededRandom(hashString(`reviews:${orgSeed}`));
  const reviews: ExternalReview[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    // Realistic skew: mostly positive, some neutral, a few negative.
    const rating = r < 0.55 ? 5 : r < 0.7 ? 4 : r < 0.85 ? 3 : r < 0.95 ? 2 : 1;
    const pool = rating >= 4 ? POSITIVE_TEXTS : rating === 3 ? NEUTRAL_TEXTS : NEGATIVE_TEXTS;
    const seed = hashString(`${orgSeed}:${i}`);
    reviews.push({
      externalId: `gb_${orgSeed.slice(0, 8)}_${i}`,
      source: 'google_business',
      author: pickDeterministic(seed, AUTHORS),
      rating,
      content: pickDeterministic(seed >>> 3, pool),
      createdAt: `${dateDaysAgo(Math.round(rand() * 60), now)}T12:00:00.000Z`,
    });
  }
  return reviews;
}
