'use client';

import { Fragment, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function AuditPage() {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors[cursors.length - 1];
  const page = trpc.audit.list.useQuery({ limit: 50, cursor });

  return (
    <div className="space-y-4 p-6" data-testid="audit-page">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="text-sm text-muted-foreground">
        An immutable record of every agent action, approval, and API write — who, what, when, and a
        hash of the payload.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Payload hash</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(page.data?.items ?? []).map((row) => (
            <Fragment key={row.id}>
              <TableRow>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.actorType === 'agent' ? 'default' : row.actorType === 'system' ? 'secondary' : 'outline'
                    }
                  >
                    {row.actorType}
                  </Badge>
                  <span className="ml-2 text-xs text-muted-foreground">{row.actorId}</span>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.action}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.entityType}
                  {row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ''}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.payloadHash ? `${row.payloadHash.slice(0, 12)}…` : '—'}
                </TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>
      <div className="flex gap-2">
        {cursors.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setCursors((c) => c.slice(0, -1))}>
            Newer
          </Button>
        )}
        {page.data?.nextCursor && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursors((c) => [...c, page.data!.nextCursor!])}
          >
            Older
          </Button>
        )}
      </div>
    </div>
  );
}
