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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
    <nav className="flex-1 space-y-0.5 p-2" data-testid="app-nav">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary/10 font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {active && (
              <span
                className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full vox-gradient"
                aria-hidden
              />
            )}
            <Icon
              className={cn(
                'h-4 w-4 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
