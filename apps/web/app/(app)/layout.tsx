// Authenticated app shell: sidebar nav + sign-out. Redirects to /login
// without a session and to /onboarding until the wizard is done.

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { Mic } from 'lucide-react';
import { db, organizations, orgMembers } from '@voxmarketer/db';
import { auth, signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import { AppNav } from '@/components/app-nav';

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
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border/60 bg-card/50 md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border/60 px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg vox-gradient">
            <Mic className="h-4 w-4 text-white" />
          </span>
          <span className="font-display font-semibold tracking-tight">VoxMarketer</span>
        </div>
        <AppNav />
        <div className="border-t border-border/60 p-3">
          <p className="truncate px-1 text-xs text-muted-foreground">{org?.name}</p>
          <p className="mb-2 truncate px-1 text-xs text-muted-foreground">{session.user.email}</p>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <Button variant="outline" size="sm" className="w-full" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
