'use client';

// Where to earn placements (Visibility Phase 2 Feature 2): domains that cite
// competitors in AI answers but never the brand — derived only from stored
// geo_results citations. Honest copy: we sell the targeting intelligence, not
// placement guarantees.

import { useEffect, useState } from 'react';
import { ExternalLink, Link2, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { geoFetch } from './visibility-fetch';

interface AuthorityTarget {
  domain: string;
  citationCount: number;
  competitorsCited: string[];
  prompts: string[];
  engines: string[];
  sampleUrl: string;
}

interface TargetsPayload {
  runId: string | null;
  targets: AuthorityTarget[];
}

export function AuthorityTargetsSection() {
  const [payload, setPayload] = useState<TargetsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    geoFetch<TargetsPayload>('/api/geo/authority-targets')
      .then(setPayload)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load authority targets'))
      .finally(() => setLoading(false));
  }, []);

  const targets = payload?.targets ?? [];

  return (
    <Card data-testid="authority-targets">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" /> Where to earn placements
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          These domains cite your competitors in AI answers but have never cited you. Earning coverage
          on them — reviews, roundups, expert quotes, data they’d reference — is how citations move.
        </p>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!loading && !error && targets.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="authority-targets-empty">
            <div className="glass-chip flex h-12 w-12 items-center justify-center rounded-2xl text-primary">
              <Link2 className="h-6 w-6" />
            </div>
            <p className="font-medium">No placement targets yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Targets are derived from citations in your latest AI-visibility scan. Run a scan first —
              if the brand is cited everywhere (or competitors never are), there’s nothing to chase.
            </p>
          </div>
        )}
        {!loading && targets.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Citations</TableHead>
                  <TableHead>Cites your competitors</TableHead>
                  <TableHead>Seen in answers to</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((target) => (
                  <TableRow key={target.domain}>
                    <TableCell className="font-medium">{target.domain}</TableCell>
                    <TableCell>{target.citationCount}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {target.competitorsCited.map((name) => (
                          <Badge key={name} variant="outline">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[18rem]">
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {target.prompts.join(' · ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        href={target.sampleUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                      >
                        visit <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Derived from {targets.length} domain(s) cited in your latest scan where competitors were
              recommended and you weren’t. This is targeting intelligence — outreach itself is up to you.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
