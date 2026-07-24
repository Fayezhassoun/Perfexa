'use client';

// Org switcher (CONTRACTS §10): dropdown of the user's orgs with an active
// marker; switching POSTs /api/org/switch then refreshes. "Add business"
// creates a new org shell and lands on the onboarding wizard for it.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

interface OrgOption {
  id: string;
  name: string;
}

export function OrgSwitcher({ orgs, activeOrgId }: { orgs: OrgOption[]; activeOrgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];

  const createOrg = trpc.orgs.create.useMutation();

  async function switchTo(orgId: string) {
    if (busy || orgId === activeOrgId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    await fetch('/api/org/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  async function addBusiness() {
    if (busy) return;
    setBusy(true);
    const name = window.prompt('Name of the new business?');
    if (!name?.trim()) {
      setBusy(false);
      return;
    }
    const org = await createOrg.mutateAsync({ name: name.trim() });
    await fetch('/api/org/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId: org.id }),
    });
    setOpen(false);
    setBusy(false);
    router.push('/onboarding');
    router.refresh();
  }

  return (
    <div className="relative" data-testid="org-switcher">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-xs font-medium">{active?.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          role="listbox"
          className="glass-strong absolute bottom-full left-0 z-50 mb-1 w-full min-w-40 rounded-xl p-1 shadow-lg"
        >
          {orgs.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === activeOrgId}
              onClick={() => switchTo(o.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-primary/10',
                o.id === activeOrgId ? 'font-medium' : 'text-muted-foreground',
              )}
            >
              <Check className={cn('h-3 w-3 shrink-0', o.id === activeOrgId ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{o.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={addBusiness}
            className="mt-0.5 flex w-full items-center gap-2 rounded-lg border-t border-[color:var(--glass-border)] px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground"
          >
            <Plus className="h-3 w-3 shrink-0" />
            Add business
          </button>
        </div>
      )}
    </div>
  );
}
