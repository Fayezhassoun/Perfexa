'use client';

// Org switcher (CONTRACTS §10): dropdown of the user's orgs with an active
// marker; switching POSTs /api/org/switch then refreshes. "Add business"
// creates a new org shell and lands on the onboarding wizard for it.

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

interface OrgOption {
  id: string;
  name: string;
}

export function OrgSwitcher({ orgs, activeOrgId, placement = 'above' }: { orgs: OrgOption[]; activeOrgId: string; placement?: 'above' | 'below' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];

  const createOrg = trpc.orgs.create.useMutation();

  async function activateOrg(orgId: string) {
    const response = await fetch('/api/org/switch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    if (!response.ok) throw new Error('We couldn’t switch workspaces. Please try again.');
  }

  async function switchTo(orgId: string) {
    if (busy || orgId === activeOrgId) { setOpen(false); return; }
    setBusy(true);
    setError(null);
    try {
      await activateOrg(orgId);
      // The query cache is keyed by procedure, not org. A fresh document clears
      // all previous-org queries and in-flight requests before showing the new org.
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t switch workspaces.');
      setBusy(false);
    }
  }

  async function addBusiness() {
    if (busy) return;
    const name = window.prompt('Name of the new business?');
    if (!name?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const org = await createOrg.mutateAsync({ name: name.trim() });
      await activateOrg(org.id);
      window.location.assign('/onboarding');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We couldn’t add this business.');
      setBusy(false);
    }
  }

  return (
    <div ref={root} className="relative" data-testid="org-switcher" onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate text-xs font-medium">{active?.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          role="dialog" aria-label="Switch workspace"
          className={cn('glass-elevated absolute left-0 z-50 w-full min-w-56 rounded-xl p-1 shadow-lg', placement === 'below' ? 'top-full mt-3' : 'bottom-full mb-1')}
        >
          {error && <p role="alert" className="p-2 text-xs text-destructive">{error}</p>}
          {orgs.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-current={o.id === activeOrgId ? 'true' : undefined}
              disabled={busy}
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
            disabled={busy}
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
