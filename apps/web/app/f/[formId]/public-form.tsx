'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function PublicLeadForm({
  formId,
  name,
  fields,
}: {
  formId: string;
  name: string;
  fields: { key: string; label: string; type: string; required: boolean }[];
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    setErrors({});
    try {
      const res = await fetch(`/api/leads/capture/${formId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = (await res.json()) as { ok?: boolean; fieldErrors?: Record<string, string> };
      if (res.ok && data.ok) {
        setState('done');
      } else {
        setErrors(data.fieldErrors ?? {});
        setState('failed');
      }
    } catch {
      setState('failed');
    }
  }

  if (state === 'done') {
    return (
      <Card className="w-full max-w-md text-center">
        <CardContent className="p-8">
          <p className="text-lg font-medium">Thanks — we got it!</p>
          <p className="mt-1 text-sm text-muted-foreground">Someone will be in touch shortly.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{name}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`f-${field.key}`}>
                {field.label}
                {field.required && <span className="text-destructive"> *</span>}
              </Label>
              {field.type === 'textarea' ? (
                <Textarea
                  id={`f-${field.key}`}
                  required={field.required}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              ) : (
                <Input
                  id={`f-${field.key}`}
                  type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  required={field.required}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              )}
              {errors[field.key] && <p className="text-sm text-destructive">{errors[field.key]}</p>}
            </div>
          ))}
          <Button type="submit" className="w-full" disabled={state === 'busy'}>
            {state === 'busy' ? 'Sending…' : 'Send'}
          </Button>
          {state === 'failed' && !Object.keys(errors).length && (
            <p className="text-sm text-destructive">Something went wrong — please try again.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
