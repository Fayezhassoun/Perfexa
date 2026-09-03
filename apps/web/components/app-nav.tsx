'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Mic,
  CalendarDays,
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
  Sparkles,
  WandSparkles,
  Brain,
  Clapperboard,
  Bell,
  Gauge,
  Globe,
  FileText,
  Radar,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/app/providers';

export const NAV = [
  { href: '/dashboard', label: 'Command Center', icon: LayoutDashboard },
  { href: '/console', label: 'Console', icon: Mic },
  { href: '/growth-plan', label: 'Growth Plan', icon: CalendarDays },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/creatives', label: 'Creative Health', icon: Gauge },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/competitors', label: 'Competitors', icon: Swords },
  { href: '/visibility', label: 'AI Visibility', icon: Radar, geo: true },
  { href: '/reviews', label: 'Reviews', icon: Star },
  { href: '/content', label: 'Content studio', icon: PenLine },
  { href: '/social', label: 'Social', icon: Share2 },
  { href: '/video', label: 'Video studio', icon: Clapperboard },
  { href: '/inspiration', label: 'Inspiration', icon: WandSparkles },
  { href: '/proposals', label: 'Proposals', icon: ClipboardCheck },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/portal', label: 'Client Portal', icon: Globe },
  { href: '/audit', label: 'Audit log', icon: ScrollText },
  { href: '/business-brain', label: 'Business Brain', icon: Sparkles },
  { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
  { href: '/memory', label: 'Business Memory', icon: Brain },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/admin', label: 'Admin', icon: ShieldCheck },
];

export const NAV_GROUPS = [
  {
    title: 'Command',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Current truth and next action',
    items: ['/dashboard', '/console', '/growth-plan'],
  },
  {
    title: 'Signals',
    href: '/alerts',
    icon: Bell,
    description: 'Risks, opportunities, and market reads',
    items: ['/alerts', '/creatives', '/campaigns', '/competitors', '/visibility', '/reviews'],
  },
  {
    title: 'Studio',
    href: '/content',
    icon: PenLine,
    description: 'Creative and publishing workbench',
    items: ['/content', '/social', '/video', '/inspiration', '/proposals'],
  },
  {
    title: 'Evidence',
    href: '/reports',
    icon: FileText,
    description: 'Reports, portal, and audit trail',
    items: ['/reports', '/portal', '/audit'],
  },
  {
    title: 'Context',
    href: '/business-brain',
    icon: Sparkles,
    description: 'Brand and business memory',
    items: ['/business-brain', '/knowledge', '/memory', '/leads'],
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'Integrations and workspace controls',
    items: ['/settings', '/agents', '/admin'],
  },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({ geoEnabled = true }: { geoEnabled?: boolean } = {}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.geo || geoEnabled);
  const byHref = new Map(items.map((item) => [item.href, item]));
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((href) => byHref.has(href)),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Workspace navigation" data-testid="app-nav">
      {groups.map((group, i) => {
        const groupActive = group.items.some((href) => isActive(pathname, href));
        const GroupIcon = group.icon;
        return (
          <section key={group.title} className="animate-nav-in" style={{ animationDelay: `${i * 45}ms` }}>
            <Link
              href={group.href}
              aria-current={isActive(pathname, group.href) ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 text-[0.84rem]',
                groupActive
                  ? 'border-primary/25 bg-primary/10 font-semibold text-foreground shadow-sm'
                  : 'border-transparent text-muted-foreground hover:border-[color:var(--glass-border)] hover:bg-[color:var(--glass-bg-subtle)] hover:text-foreground',
              )}
            >
              <GroupIcon className={cn('h-4 w-4', groupActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
              <span className="min-w-0">
                <span className="block leading-tight">{group.title}</span>
                <span className="block truncate text-[0.64rem] font-normal text-muted-foreground">{group.description}</span>
              </span>
            </Link>
            <div className="mt-1.5 space-y-0.5 pl-8">
              {group.items
                .filter((href) => href !== group.href)
                .map((href) => {
                  const item = byHref.get(href);
                  if (!item) return null;
                  const active = isActive(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-[0.76rem]',
                        active
                          ? 'bg-primary/8 font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-[color:var(--glass-bg-subtle)] hover:text-foreground',
                      )}
                    >
                      <item.icon className={cn('h-3.5 w-3.5', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
            </div>
          </section>
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
      className="btn-glass flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all duration-300 hover:text-foreground active:scale-95"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
