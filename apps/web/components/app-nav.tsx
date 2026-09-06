'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  ChevronDown,
  Crosshair,
  Activity,
  PanelsTopLeft,
  ChartNoAxesCombined,
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
    icon: Crosshair,
    description: 'Current truth and next action',
    items: ['/dashboard', '/console', '/growth-plan'],
  },
  {
    title: 'Signals',
    href: '/alerts',
    icon: Activity,
    description: 'Risks, opportunities, and market reads',
    items: ['/alerts', '/creatives', '/campaigns', '/competitors', '/visibility', '/reviews'],
  },
  {
    title: 'Studio',
    href: '/content',
    icon: PanelsTopLeft,
    description: 'Creative and publishing workbench',
    items: ['/content', '/social', '/video', '/inspiration', '/proposals'],
  },
  {
    title: 'Evidence',
    href: '/reports',
    icon: ChartNoAxesCombined,
    description: 'Reports, portal, and audit trail',
    items: ['/reports', '/portal', '/audit'],
  },
  {
    title: 'Context',
    href: '/business-brain',
    icon: BookOpen,
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const byHref = new Map(NAV.filter((item) => !item.geo || geoEnabled).map((item) => [item.href, item]));
  return (
    <nav className="workspace-nav" aria-label="Workspace navigation" data-testid="app-nav">
      {NAV_GROUPS.map((group) => {
        const active = group.items.some((href) => isActive(pathname, href));
        const open = expanded === group.title;
        const items = group.items.filter((href) => byHref.has(href));
        const Icon = group.icon;
        return (
          <section key={group.title} className={cn('workspace-nav-group', active && 'is-active')}>
            <div className="workspace-nav-row">
              <Link href={group.href} aria-current={isActive(pathname, group.href) ? 'page' : undefined}>
                <Icon size={23} strokeWidth={1.6} /><span>{group.title}</span>
              </Link>
              <button type="button" aria-label={`${open ? 'Collapse' : 'Expand'} ${group.title} sections`}
                aria-expanded={open} aria-controls={`nav-${group.title.toLowerCase()}`}
                onClick={() => setExpanded(open ? null : group.title)}>
                <ChevronDown size={14} className={cn(open && 'rotate-180')} />
              </button>
            </div>
            <div id={`nav-${group.title.toLowerCase()}`} hidden={!open} className="workspace-subnav">
              {items.map((href) => {
                const item = byHref.get(href)!;
                return <Link key={href} href={href} aria-current={isActive(pathname, href) ? 'page' : undefined}>{item.label}</Link>;
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
