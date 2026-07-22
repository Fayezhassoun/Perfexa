// Authenticated app shell: glass sidebar + blur top bar over the animated
// mesh backdrop. Redirects to /login without a session and to /onboarding
// until the wizard is done.

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Mic } from 'lucide-react';
import { db, organizations, orgMembers } from '@voxmarketer/db';
import { auth, signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import { AppNav, ThemeToggle } from '@/components/app-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [membership] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, session.user.id))
    .limit(1);
  if (!membership) redirect('/onboarding');
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, membership.orgId))
    .limit(1);
  if (org && org.onboardingStep !== 'done') redirect('/onboarding');

  return (
    <div className="vox-backdrop flex min-h-screen">
      {/* Glass sidebar — stronger blur than cards */}
      <aside className="glass-strong fixed inset-y-0 left-0 z-40 hidden w-60 flex-col rounded-none border-y-0 border-l-0 md:flex">
        <div className="glass-divider-b flex h-16 items-center gap-2.5 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg shadow-primary/30 vox-gradient">
            <Mic className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">VoxMarketer</span>
        </div>
        <AppNav />
        <div className="glass-divider-t p-4">
          <div className="glass-subtle mb-3 rounded-xl px-3 py-2.5">
            <p className="truncate text-xs font-medium">{org?.name}</p>
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
            <span className="font-display text-sm font-semibold tracking-tight">VoxMarketer</span>
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
