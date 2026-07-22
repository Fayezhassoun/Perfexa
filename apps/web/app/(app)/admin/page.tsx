'use client';

import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function AdminPage() {
  const users = trpc.admin.users.useQuery();
  const health = trpc.admin.health.useQuery();

  return (
    <div className="animate-page-in space-y-6 p-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Admin</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">System health</CardTitle>
        </CardHeader>
        <CardContent>
          {health.data ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant={health.data.db === 'ok' ? 'success' : 'destructive'}>db: {health.data.db}</Badge>
              <Badge variant={health.data.redis === 'ok' ? 'success' : 'warning'}>
                redis: {health.data.redis}
              </Badge>
              <Badge variant="secondary">llm: {health.data.llm}</Badge>
              <Badge variant="secondary">stt: {health.data.stt}</Badge>
              <Badge variant="secondary">tts: {health.data.tts}</Badge>
              {health.data.adapters.map((a) => (
                <Badge key={a.platform} variant="outline">
                  {a.platform}: {a.mode} · {a.status}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Checking…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users.data ?? []).map((u) => (
                <TableRow key={`${u.userId}-${u.orgId}`}>
                  <TableCell>{u.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{u.role}</Badge>
                  </TableCell>
                  <TableCell>{u.orgName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
