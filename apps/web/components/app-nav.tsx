'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Mic,
  LayoutDashboard,
  Bot,
  Megaphone,
  ClipboardCheck,
  Users,
  BookOpen,
  ScrollText,
  Settings,
  ShieldCheck,
  Share2,
  PenLine,
  Swords,
  Star,
  Moon,
  Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/providers';

const NAV = [
  { href: '/console', label: 'Voice Console', icon: Mic },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/proposals', label: 'Proposals', icon: ClipboardCheck },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/social', label: 'Social', icon: Share2 },
  { href: '/content', label: 'Content studio', icon: PenLine },
  { href: '/competitors', label: 'Competitors', icon: Swords },
  { href: '/reviews', label: 'Reviews', icon: Star },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/audit', label: 'Audit log', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', icon: ShieldCheck },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3" data-testid="app-nav">
      {NAV.map(({ href, label, icon: Icon }, i) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            style={{ animationDelay: `${i * 50}ms` }}
            className={cn(
              'animate-nav-in group relative flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-all duration-300',
              active
                ? 'border-[color:var(--glass-border-strong)] bg-primary/15 font-medium text-foreground shadow-[var(--glass-shadow)] backdrop-blur-md'
                : 'border-transparent text-muted-foreground hover:border-[color:var(--glass-border)] hover:bg-[color:var(--glass-bg-subtle)] hover:text-foreground hover:backdrop-blur-md',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 transition-all duration-300 group-hover:scale-110',
                active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            {label}
            {active && (
              <span
                className="absolute right-3 h-1.5 w-1.5 rounded-full vox-gradient"
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Light/dark glass theme toggle (sun/moon). */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="btn-glass flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-300 hover:text-foreground active:scale-95"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
