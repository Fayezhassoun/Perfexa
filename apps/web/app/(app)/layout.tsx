// Authenticated app shell. Keep the session, org resolution, and onboarding
// guards server-side; this file only owns the shared visual frame.

import { redirect } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { db, organizations } from '@growthcrew/db';
import { auth, signOut } from '@/auth';
import { resolveActiveOrg } from '@/server/org-resolution';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/button';
import { AppNav, ThemeToggle } from '@/components/app-nav';
import { MobileNav } from '@/components/mobile-nav';
import { OrgSwitcher } from '@/components/org-switcher';
import { BrandMark } from '@/components/brand-mark';

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
    <div className="liquid-shell flex min-h-screen">
      <aside className="liquid-sidebar fixed inset-y-0 left-0 z-40 hidden w-56 flex-col rounded-none border-y-0 border-l-0 md:flex">
        <div className="glass-divider-b flex h-16 items-center px-5">
          <BrandMark href="/console" size="md" />
        </div>
        <AppNav geoEnabled={env.GEO_ENABLED} />
        <div className="glass-divider-t p-4">
          <div className="glass-tile mb-3 space-y-2 rounded-xl px-3 py-2.5">
            <OrgSwitcher
              orgs={orgRows.map((o) => ({ id: o.id, name: o.name }))}
              activeOrgId={orgId}
            />
            <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <form
              className="flex-1"
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <Button variant="outline" size="sm" className="w-full" type="submit">
                Sign out
              </Button>
            </form>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Content column with blur top bar */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-56">
        <header className="liquid-topbar sticky top-0 z-30 flex h-14 items-center justify-between px-6">
          <div className="md:hidden">
            <BrandMark href="/console" size="sm" />
          </div>
          <span className="hidden truncate text-sm text-muted-foreground md:block">
            {org?.name}
          </span>
          <span className="md:hidden">
            <ThemeToggle />
          </span>
        </header>
        <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <MobileNav geoEnabled={env.GEO_ENABLED} />
    </div>
  );
}
