'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, Settings } from 'lucide-react';
import { ThemeToggle } from './app-nav';

export function WorkspaceAccount({ name, email, children }: {
  name: string; email: string; children: React.ReactNode;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  return (
    <details ref={menu} className="workspace-account" onKeyDown={(event) => {
      if (event.key === 'Escape' && menu.current) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    }}>
      <summary aria-label="Account menu"><span className="workspace-avatar">{initials || 'P'}</span><ChevronDown size={16} /></summary>
      <div className="workspace-account-panel">
        <strong>{name}</strong><p>{email}</p>
        <Link href="/settings" onClick={() => { if (menu.current) menu.current.open = false; }}><Settings size={16} /> Workspace settings</Link>
        <div className="workspace-account-footer">{children}<ThemeToggle /></div>
      </div>
    </details>
  );
}
