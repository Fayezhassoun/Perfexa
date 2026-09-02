// Public hosted lead form (CONTRACTS §10 /f/[formId]) — no auth.

import { db } from '@growthcrew/db';
import { services } from '@growthcrew/agents';
import { PublicLeadForm } from './public-form';

export const dynamic = 'force-dynamic';

export default async function HostedFormPage({ params }: { params: { formId: string } }) {
  const form = await services.leads.getPublicForm(db, params.formId);
  if (!form) {
    return (
      <div className="public-shell flex min-h-screen items-center justify-center p-4 text-[hsl(var(--ink-soft))]">
        This form doesn&apos;t exist (or was removed).
      </div>
    );
  }
  return (
    <div className="public-shell flex min-h-screen items-center justify-center p-4">
      <PublicLeadForm
        formId={form.id}
        name={form.name ?? 'Get in touch'}
        fields={(form.fields ?? []) as { key: string; label: string; type: string; required: boolean }[]}
      />
    </div>
  );
}
