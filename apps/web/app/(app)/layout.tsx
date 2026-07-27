// Authenticated app shell: glass sidebar + blur top bar over the animated
// mesh backdrop. Redirects to /login without a session and to /onboarding
// until the wizard is done.

import { redirect } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { Mic } from 'lucide-react';
import { db, organizations } from '@sayso/db';
import { auth, signOut } from '@/auth';
import { resolveActiveOrg } from '@/server/org-resolution';
import { Button } from '@/components/ui/button';
import { AppNav, ThemeToggle } from '@/components/app-nav';
import { OrgSwitcher } from '@/components/org-switcher';

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
    <div className="vox-backdrop flex min-h-screen">
      {/* Glass sidebar — stronger blur than cards */}
      <aside className="glass-strong fixed inset-y-0 left-0 z-40 hidden w-60 flex-col rounded-none border-y-0 border-l-0 md:flex">
        <div className="glass-divider-b flex h-16 items-center gap-2.5 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg shadow-primary/30 vox-gradient">
            <Mic className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Sayso</span>
        </div>
        <AppNav />
        <div className="glass-divider-t p-4">
          <div className="glass-subtle mb-3 space-y-2 rounded-xl px-3 py-2.5">
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
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="glass-topbar sticky top-0 z-30 flex h-14 items-center justify-between px-6">
          <span className="flex items-center gap-2 md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg vox-gradient">
              <Mic className="h-3.5 w-3.5 text-white" />
            </span>
            <span className="font-display text-sm font-semibold tracking-tight">Sayso</span>
          </span>
          <span className="hidden truncate text-sm text-muted-foreground md:block">
            {org?.name}
          </span>
          <span className="md:hidden">
            <ThemeToggle />
          </span>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
