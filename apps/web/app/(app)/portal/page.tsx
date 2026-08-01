'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Palette,
  Plus,
  ShieldOff,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageShell, PageHeader } from '@/components/page-shell';
import { cn } from '@/lib/utils';

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
};

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

type ShareLink = {
  id: string;
  token: string;
  label: string | null;
  scopes: string[] | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export default function PortalPage() {
  const utils = trpc.useUtils();

  const portal = trpc.portal.get.useQuery();
  const shareLinks = trpc.portal.shareLinks.useQuery();
  const update = trpc.portal.update.useMutation({ onSuccess: () => utils.portal.invalidate() });
  const createLink = trpc.portal.createShareLink.useMutation({ onSuccess: () => utils.portal.invalidate() });
  const revokeLink = trpc.portal.revokeShareLink.useMutation({ onSuccess: () => utils.portal.invalidate() });

  const cfg = portal.data?.config ?? {};
  const enabled = portal.data?.enabled ?? false;

  // Local draft state, synced from server
  const [portalName, setPortalName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [accentColor, setAccentColor] = useState('#7c3aed');
  const [footerText, setFooterText] = useState('');
  const [showBranding, setShowBranding] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newExpiry, setNewExpiry] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (portal.data) {
      const c = portal.data.config ?? {};
      setPortalName(c.portalName ?? '');
      setPrimaryColor(c.primaryColor ?? '#2563eb');
      setAccentColor(c.accentColor ?? '#7c3aed');
      setFooterText(c.footerText ?? '');
      setShowBranding(c.showGrowthCrewBranding ?? true);
    }
  }, [portal.data]);

  const handleSave = () => {
    update.mutate(
      {
        config: {
          portalName: portalName || undefined,
          primaryColor,
          accentColor,
          footerText: footerText || undefined,
          showGrowthCrewBranding: showBranding,
        },
        enabled,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  const handleCreateLink = () => {
    if (!newLabel.trim()) return;
    createLink.mutate(
      {
        label: newLabel.trim(),
        scopes: ['dashboard', 'alerts'],
        expiresInDays: newExpiry ? Number(newExpiry) : undefined,
      },
      { onSuccess: () => setNewLabel('') },
    );
  };

  const copyLink = async (link: ShareLink) => {
    const url = `${window.location.origin}/api/portal/${link.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const links = (shareLinks.data ?? []) as ShareLink[];

  return (
    <PageShell className="space-y-6" data-testid="portal">
      <PageHeader
        eyebrow="White-label"
        title="Client Portal"
        description="Give every client a branded, read-only view of their growth — your name, your colors, your logo. Share with a link; revoke anytime."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={enabled}
                onCheckedChange={(v) => update.mutate({ enabled: v })}
                aria-label="Enable portal"
              />
              <span className="text-sm font-medium">{enabled ? 'Portal live' : 'Portal off'}</span>
            </div>
            <Button onClick={handleSave} disabled={update.isPending}>
              {saved ? <Check /> : <Sparkles />}
              {saved ? 'Saved' : update.isPending ? 'Saving…' : 'Save branding'}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr,1.1fr]">
        {/* ── Config column ── */}
        <div className="space-y-6">
          <div className="glass-panel animate-fade-up space-y-5 p-5">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-semibold">Brand identity</h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="portalName">Portal name</Label>
              <Input
                id="portalName"
                value={portalName}
                onChange={(e) => setPortalName(e.target.value)}
                placeholder="Your agency's client-facing name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Primary color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="primaryColor"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-lg border border-[color:var(--glass-border)] bg-transparent p-1"
                  />
                  <code className="text-xs text-muted-foreground">{primaryColor}</code>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="accentColor">Accent color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="accentColor"
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-lg border border-[color:var(--glass-border)] bg-transparent p-1"
                  />
                  <code className="text-xs text-muted-foreground">{accentColor}</code>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="footerText">Footer text</Label>
              <Input
                id="footerText"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Prepared by Your Agency"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Show GrowthCrew branding</p>
                <p className="text-xs text-muted-foreground">Adds a "Powered by GrowthCrew" badge</p>
              </div>
              <Switch checked={showBranding} onCheckedChange={setShowBranding} aria-label="Show GrowthCrew branding" />
            </div>
          </div>

          {/* Share links */}
          <div className="glass-panel animate-fade-up space-y-4 p-5" style={{ animationDelay: '80ms' }}>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-semibold">Share links</h2>
            </div>

            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Link label (e.g. Acme Q3 report)"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateLink()}
              />
              <Input
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                placeholder="Days"
                type="number"
                className="w-20"
              />
              <Button onClick={handleCreateLink} disabled={createLink.isPending || !newLabel.trim()}>
                <Plus />
              </Button>
            </div>

            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">No share links yet. Create one to give a client access.</p>
            ) : (
              <div className="space-y-2">
                {links.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{link.label ?? 'Untitled'}</p>
                      <p className="truncate font-mono text-[0.68rem] text-muted-foreground">/api/portal/{link.token}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => copyLink(link)} aria-label="Copy link">
                        {copiedId === link.id ? <Check className="text-emerald-500" /> : <Copy />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeLink.mutate({ linkId: link.id })}
                        aria-label="Revoke link"
                      >
                        <Trash2 className="text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Live preview column ── */}
        <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
          <div className="sticky top-24">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Live client preview
              </p>
              <Badge variant={enabled ? 'success' : 'secondary'}>
                <Globe className="mr-1 h-3 w-3" /> {enabled ? 'Accessible' : 'Disabled'}
              </Badge>
            </div>

            {/* Simulated client dashboard */}
            <div
              className="overflow-hidden rounded-2xl border shadow-2xl transition-all duration-300"
              style={{ borderColor: `${primaryColor}40` }}
            >
              {/* Client header */}
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-display text-base font-semibold text-white">
                      {portalName || 'Your Agency'}
                    </p>
                    <p className="text-[0.68rem] text-white/70">Growth report</p>
                  </div>
                </div>
                {showBranding && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[0.62rem] font-medium text-white/80 backdrop-blur">
                    Powered by GrowthCrew
                  </span>
                )}
              </div>

              {/* Client body */}
              <div className="space-y-4 bg-background p-5">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Spend', value: '$12,480' },
                    { label: 'Conversions', value: '342' },
                    { label: 'Active', value: '3' },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] p-3">
                      <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                      <p className="mt-1 font-display text-xl font-semibold tabular-nums" style={{ color: primaryColor }}>
                        {kpi.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {[
                    { name: 'Summer Sale', platform: 'Meta', ctr: '4.2%' },
                    { name: 'Brand Search', platform: 'Google Ads', ctr: '6.8%' },
                    { name: 'Prospecting', platform: 'TikTok', ctr: '2.9%' },
                  ].map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between rounded-lg border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: accentColor }} />
                        <span className="text-sm font-medium">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{c.platform}</span>
                        <span className="font-mono tabular-nums">{c.ctr}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-start gap-2 rounded-lg border px-3 py-2" style={{ borderColor: `${accentColor}40`, background: `${accentColor}10` }}>
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} />
                  <p className="text-xs text-muted-foreground">
                    1 alert: "Summer Sale" frequency approaching saturation — rotation recommended.
                  </p>
                </div>

                <p className="pt-1 text-center text-[0.62rem] text-muted-foreground">
                  {footerText || (showBranding ? 'Powered by GrowthCrew' : 'Prepared for you')}
                </p>
              </div>
            </div>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Preview updates as you type. Clients see exactly this — with live data.
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
