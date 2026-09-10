// Authenticated app shell. Keep the session, org resolution, and onboarding
// guards server-side; this file only owns the shared visual frame.

import { redirect } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { db, organizations } from '@growthcrew/db';
import { auth, signOut } from '@/auth';
import { resolveActiveOrg } from '@/server/org-resolution';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { WorkspaceSearch } from '@/components/workspace-search';
import { AppNav } from '@/components/app-nav';
import { WorkspaceAccount } from '@/components/workspace-account';
import Link from 'next/link';
import { MobileNav } from '@/components/mobile-nav';
import { OrgSwitcher } from '@/components/org-switcher';
import './workspace.css';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { orgId, memberships } = await resolveActiveOrg(db, session.user.id);
  if (!orgId) redirect('/onboarding');
  const orgIds = memberships.map((m) => m.orgId);
  const orgRows = await db
    .select({ id: organizations.id, name: organizations.name, onboardingStep: organizations.onboardingStep })
    .from(organizations)
    .where(inArray(organizations.id, orgIds));
  const org = orgRows.find((o) => o.id === orgId) ?? null;
  if (org && org.onboardingStep !== 'done') redirect('/onboarding');

  return (
    <div className="brief-workspace flex min-h-screen">
      <a href="#workspace-main" className="workspace-skip">Skip to content</a>
      <aside className="workspace-sidebar">
        <Link href="/dashboard" className="workspace-wordmark" aria-label="Perfexa home">Perfexa</Link>
        <AppNav geoEnabled={env.GEO_ENABLED} />
      </aside>
      <div className="workspace-column">
        <header className="workspace-topbar">
          <Link href="/dashboard" className="workspace-mobile-brand" aria-label="Perfexa home">Perfexa</Link>
          <OrgSwitcher
            orgs={orgRows.map((o) => ({ id: o.id, name: o.name }))}
            activeOrgId={orgId}
            placement="below"
          />
          <WorkspaceSearch geoEnabled={env.GEO_ENABLED} />
          <time className="workspace-today" dateTime={new Date().toISOString().slice(0, 10)}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </time>
          <WorkspaceAccount name={session.user.name || 'Your account'} email={session.user.email || ''}>
            <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}>
              <Button variant="ghost" size="sm" type="submit">Sign out</Button>
            </form>
          </WorkspaceAccount>
        </header>
        <main id="workspace-main" tabIndex={-1} className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <MobileNav geoEnabled={env.GEO_ENABLED} />
    </div>
  );
}

