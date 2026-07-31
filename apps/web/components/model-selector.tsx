'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export function ModelSelectorCard() {
  const utils = trpc.useUtils();
  const trpcModels = (trpc as any).models;

  const providersQuery = trpcModels?.listProviders?.useQuery?.();
  const selectedQuery = trpcModels?.getSelected?.useQuery?.();

  const [provider, setProvider] = useState<string>('mock');
  const [model, setModel] = useState<string>('mock');
  const [message, setMessage] = useState<string | null>(null);

  const setSelectedMutation = trpcModels?.setSelected?.useMutation?.({
    onSuccess: (data: { provider: string; model: string }) => {
      if (utils.settings) {
        utils.settings.invalidate();
      }
      setMessage(`Saved: ${data.provider} (${data.model})`);
    },
    onError: (e: { message: string }) => {
      setMessage(`Error: ${e.message}`);
    },
  });

  const providers: Array<{ id: string; label: string; defaultModel: string; configured: boolean }> =
    providersQuery?.data ?? [];

  useEffect(() => {
    if (selectedQuery?.data?.provider) {
      setProvider(selectedQuery.data.provider);
      if (selectedQuery.data.model) {
        setModel(selectedQuery.data.model);
      }
    }
  }, [selectedQuery?.data]);

  const activeProvider = providers.find((p) => p.id === provider);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setMessage(null);
    const pInfo = providers.find((p) => p.id === newProvider);
    if (pInfo) {
      setModel(pInfo.defaultModel);
    }
  };

  const handleSave = () => {
    setMessage(null);
    setSelectedMutation?.mutate({ provider, model });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Model Selection</CardTitle>
        <CardDescription>
          Choose the LLM provider and model for your organization. Mock mode is fully offline; cloud providers require an API key in your environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="provider-select">Provider</Label>
            {activeProvider && (
              <Badge variant={activeProvider.configured ? 'success' : 'outline'}>
                {activeProvider.configured ? 'Configured' : 'Key missing'}
              </Badge>
            )}
          </div>
          <Select
            id="provider-select"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            disabled={providersQuery?.isLoading}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} {p.configured ? '' : '— Key missing'}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model-input">Model Name</Label>
          <Input
            id="model-input"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setMessage(null);
            }}
            placeholder={activeProvider?.defaultModel ?? 'Model name'}
          />
          {activeProvider && (
            <p className="text-xs text-muted-foreground">
              Default model for {activeProvider.label}: <code>{activeProvider.defaultModel}</code>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            onClick={handleSave}
            disabled={setSelectedMutation?.isPending || providersQuery?.isLoading}
          >
            {setSelectedMutation?.isPending ? 'Saving...' : 'Save AI Model'}
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
