// Google Analytics 4 stub — deterministic mock traffic series (phase 2 shape).

import { dateDaysAgo, hashString, seededRandom } from './util/hash.js';

export interface Ga4TrafficPoint {
  date: string;
  sessions: number;
  users: number;
  conversions: number;
}

export async function getGa4Traffic(propertyUrl: string, days = 30): Promise<Ga4TrafficPoint[]> {
  const seed = hashString(propertyUrl);
  const rand = seededRandom(seed);
  const baseSessions = 20 + (seed % 180);
  const points: Ga4TrafficPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const weeklyWave = 1 + 0.25 * Math.sin(((days - i) / 7) * Math.PI * 2);
    const sessions = Math.max(1, Math.round(baseSessions * weeklyWave * (0.85 + rand() * 0.3)));
    points.push({
      date: dateDaysAgo(i),
      sessions,
      users: Math.round(sessions * (0.7 + rand() * 0.2)),
      conversions: Math.floor(sessions * (0.01 + rand() * 0.03)),
    });
  }
  return points;
}
