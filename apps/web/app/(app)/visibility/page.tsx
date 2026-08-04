// AI Visibility (GEO) — Phase 1 dashboard. The whole surface disappears when
// GEO_ENABLED=false (routes 404 too); see server/geo.ts.

import { notFound } from 'next/navigation';
import { env } from '@/lib/env';
import { VisibilityDashboard } from './visibility-dashboard';

export default function VisibilityPage() {
  if (!env.GEO_ENABLED) notFound();
  return <VisibilityDashboard />;
}
