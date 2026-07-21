'use client';

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const utils = trpc.useUtils();
  const detail = trpc.agents.get.useQuery({ id: params.id });
  const setStatus = trpc.agents.setStatus.useMutation({ onSuccess: () => utils.agents.invalidate() });

  if (detail.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!detail.data) return <p className="p-6 text-sm text-muted-foreground">Agent not found.</p>;

  const { agent, tools, memory, runs } = detail.data;
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{agent.name ?? agent.type}</h1>
          <p className="text-sm text-muted-foreground">{agent.type}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={agent.status === 'active' ? 'success' : 'secondary'}>{agent.status}</Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={setStatus.isPending}
            onClick={() =>
              setStatus.mutate({ id: agent.id, status: agent.status === 'active' ? 'paused' : 'active' })
            }
          >
            {agent.status === 'active' ? 'Pause agent' : 'Resume agent'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tools.map((tool) => (
              <div key={tool.name} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="font-mono text-sm">{tool.name}</p>
                  <p className="text-xs text-muted-foreground">{tool.description}</p>
                </div>
                {tool.gated && <Badge variant="warning">approval required</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Memory & config</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify({ config: agent.config, memory }, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.map((run) => (
            <details key={run.id} className="rounded-lg border p-3">
              <summary className="flex cursor-pointer items-center justify-between text-sm">
                <span className="truncate">{run.input ?? '(no input)'}</span>
                <span className="flex items-center gap-2">
                  <Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'destructive' : 'secondary'}>
                    {run.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </span>
              </summary>
              <div className="mt-2 space-y-2 text-sm">
                {run.output && <p className="text-muted-foreground">{run.output}</p>}
                {run.error && <p className="text-destructive">{run.error}</p>}
                {!!run.toolCalls && (
                  <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(run.toolCalls, null, 2)}
                  </pre>
                )}
              </div>
            </details>
          ))}
          {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
