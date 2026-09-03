'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, FileText, LayoutDashboard, Menu, PenLine, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { NAV, NAV_GROUPS } from './app-nav';

/**
 * Mobile navigation. Two layers:
 *  1. A fixed bottom tab bar with the 5 highest-frequency surfaces (thumb reach).
 *  2. A "More" tab that opens a full-screen glass sheet with every surface,
 *     grouped, so nothing is unreachable on a phone.
 *
 * Desktop uses the sidebar (hidden on mobile); this component is the mobile
 * counterpart and renders nothing at md+ (the sidebar takes over).
 */

const PRIMARY = [
  { href: '/dashboard', label: 'Command', icon: LayoutDashboard, hrefs: ['/dashboard', '/console', '/growth-plan'] },
  { href: '/alerts', label: 'Signals', icon: Bell, hrefs: ['/alerts', '/creatives', '/campaigns', '/competitors', '/visibility', '/reviews'] },
  { href: '/content', label: 'Studio', icon: PenLine, hrefs: ['/content', '/social', '/video', '/inspiration', '/proposals'] },
  { href: '/reports', label: 'Evidence', icon: FileText, hrefs: ['/reports', '/portal', '/audit'] },
];

export function MobileNav({ geoEnabled = true }: { geoEnabled?: boolean } = {}) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Lock body scroll while the sheet is open; close on route change.
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const byHref = new Map(NAV.filter((n) => !n.geo || geoEnabled).map((n) => [n.href, n]));
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((href) => byHref.has(href)),
  })).filter((group) => group.items.length > 0);

  const isOnPrimary = PRIMARY.some(
    (p) => p.hrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`)),
  );

  return (
    <>
      {/* ── Bottom tab bar ─────────────────────────────────────── */}
      <nav
        aria-label="Primary"
        className="liquid-topbar fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
        data-testid="mobile-nav"
      >
        {PRIMARY.map(({ href, hrefs, label, icon: Icon }) => {
          const active = hrefs.some((itemHref) => pathname === itemHref || pathname.startsWith(`${itemHref}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Open full menu"
          aria-expanded={sheetOpen}
          className={cn(
            'flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors',
            !isOnPrimary ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* ── Full menu sheet ────────────────────────────────────── */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="All sections">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="liquid-shell absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-fade-up">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-sm font-semibold">All sections</span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="btn-glass flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.title}>
                  <Link
                    href={group.href}
                    className="mb-2 flex items-center gap-2 px-1 text-[0.76rem] font-semibold text-foreground"
                  >
                    <group.icon className="h-4 w-4 text-primary" />
                    {group.title}
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((href) => {
                      const item = byHref.get(href);
                      if (!item) return null;
                      const Icon = item.icon;
                      const active = pathname === href || pathname.startsWith(`${href}/`);
                      return (
                        <Link
                          key={href}
                          href={href}
                          className={cn(
                            'glass-tile flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-center text-[0.68rem] font-medium transition-all',
                            active
                              ? 'border-primary/25 bg-primary/12 text-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          <Icon className={cn('h-5 w-5', active && 'text-primary')} />
                          <span className="leading-tight">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
