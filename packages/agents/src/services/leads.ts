// Lead services (CONTRACTS §5/§7): mini-CRM list/update/CSV + form builder.

import { and, desc, eq, or, sql } from 'drizzle-orm';
import { leadForms, leads, type Lead, type LeadForm } from '@voxmarketer/db';
import type { AgentContext } from '../types.js';

export async function listLeads(ctx: AgentContext, filter?: { status?: string; q?: string }): Promise<Lead[]> {
  const conditions = [eq(leads.orgId, ctx.orgId)];
  if (filter?.status) conditions.push(eq(leads.status, filter.status));
  if (filter?.q) {
    const pattern = `%${filter.q}%`;
    conditions.push(or(sql`${leads.name} ilike ${pattern}`, sql`${leads.email} ilike ${pattern}`)!);
  }
  return ctx.db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt))
    .limit(500);
}

export async function updateLead(
  ctx: AgentContext,
  id: string,
  patch: { status?: 'new' | 'contacted' | 'won' | 'lost'; notes?: string; score?: number },
): Promise<Lead> {
  const [existing] = await ctx.db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Lead not found');
  const [updated] = await ctx.db
    .update(leads)
    .set({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.score !== undefined ? { score: patch.score } : {}),
    })
    .where(eq(leads.id, id))
    .returning();
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'lead.updated',
    entityType: 'lead',
    entityId: id,
    payload: patch,
  });
  return updated!;
}

function csvEscape(value: string | null | undefined): string {
  const s = value ?? '';
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadsToCsv(rows: Lead[]): string {
  const header = 'name,email,phone,score,status,source_campaign_id,notes,created_at';
  const lines = rows.map((l) =>
    [
      csvEscape(l.name),
      csvEscape(l.email),
      csvEscape(l.phone),
      String(l.score ?? 0),
      csvEscape(l.status),
      csvEscape(l.sourceCampaignId),
      csvEscape(l.notes),
      l.createdAt.toISOString(),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

export async function listForms(ctx: AgentContext): Promise<(LeadForm & { leadCount: number })[]> {
  const forms = await ctx.db.select().from(leadForms).where(eq(leadForms.orgId, ctx.orgId)).orderBy(desc(leadForms.createdAt));
  const counts = await ctx.db
    .select({ formId: leads.formId, count: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.orgId, ctx.orgId))
    .groupBy(leads.formId);
  const byForm = new Map(counts.map((c) => [c.formId, c.count]));
  return forms.map((f) => ({ ...f, leadCount: byForm.get(f.id) ?? 0 }));
}

export interface LeadField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea';
  required: boolean;
}

export async function createForm(ctx: AgentContext, name: string, fields?: LeadField[]): Promise<LeadForm> {
  const finalFields: LeadField[] = fields?.length
    ? fields
    : [
        { key: 'name', label: 'Your name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'phone', label: 'Phone', type: 'phone', required: false },
        { key: 'message', label: 'How can we help?', type: 'textarea', required: false },
      ];
  const [form] = await ctx.db.insert(leadForms).values({ orgId: ctx.orgId, name, fields: finalFields }).returning();
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'lead_form.created',
    entityType: 'lead_form',
    entityId: form!.id,
    payload: { name, fieldCount: finalFields.length },
  });
  return form!;
}

export async function updateForm(ctx: AgentContext, id: string, patch: { name?: string; fields?: LeadField[] }): Promise<LeadForm> {
  const [existing] = await ctx.db
    .select()
    .from(leadForms)
    .where(and(eq(leadForms.id, id), eq(leadForms.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Form not found');
  const [updated] = await ctx.db
    .update(leadForms)
    .set({ ...(patch.name ? { name: patch.name } : {}), ...(patch.fields ? { fields: patch.fields } : {}) })
    .where(eq(leadForms.id, id))
    .returning();
  return updated!;
}

/** Public form lookup for the hosted lead page + capture endpoint (no auth). */
export async function getPublicForm(db: AgentContext['db'], formId: string): Promise<LeadForm | null> {
  const [form] = await db.select().from(leadForms).where(eq(leadForms.id, formId)).limit(1);
  return form ?? null;
}

/**
 * Public capture (CONTRACTS §6): validates the payload against the form's own
 * field definitions, scores the lead, inserts it, and audit-logs — all without
 * an authenticated session (orgId comes from the form row).
 */
export async function captureLead(
  db: AgentContext['db'],
  formId: string,
  payload: Record<string, unknown>,
  sourceCampaignId?: string | null,
): Promise<{ lead: Lead } | { error: string; fieldErrors?: Record<string, string> }> {
  const form = await getPublicForm(db, formId);
  if (!form) return { error: 'Form not found' };

  const fields = (form.fields ?? []) as LeadField[];
  const fieldErrors: Record<string, string> = {};
  const custom: Record<string, string> = {};
  for (const field of fields) {
    const raw = payload[field.key];
    const value = typeof raw === 'string' ? raw.trim().slice(0, 2000) : '';
    if (field.required && !value) {
      fieldErrors[field.key] = `${field.label} is required`;
      continue;
    }
    if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      fieldErrors[field.key] = 'Enter a valid email';
      continue;
    }
    if (value) custom[field.key] = value;
  }
  if (Object.keys(fieldErrors).length) return { error: 'Validation failed', fieldErrors };

  const { name, email, phone, ...rest } = custom;
  const draft = { email: email ?? null, phone: phone ?? null, sourceCampaignId: sourceCampaignId ?? null };
  const { scoreLead } = await import('../tools.js');
  const [lead] = await db
    .insert(leads)
    .values({
      orgId: form.orgId,
      formId: form.id,
      sourceCampaignId: sourceCampaignId ?? null,
      name: name ?? null,
      email: email ?? null,
      phone: phone ?? null,
      customFields: rest,
      score: scoreLead(draft),
      status: 'new',
    })
    .returning();

  const { createAuditLogger } = await import('../audit.js');
  await createAuditLogger(db, form.orgId).log({
    actorType: 'system',
    actorId: 'lead-capture',
    action: 'lead.captured',
    entityType: 'lead',
    entityId: lead!.id,
    payload: { formId: form.id, sourceCampaignId: sourceCampaignId ?? null },
  });
  return { lead: lead! };
}

export function embedSnippet(ctx: AgentContext, formId: string): { snippet: string; hostedUrl: string } {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const hostedUrl = `${base}/f/${formId}`;
  const snippet =
    `<iframe src="${hostedUrl}" style="width:100%;max-width:480px;height:520px;border:0;border-radius:12px" ` +
    `title="Contact form" loading="lazy"></iframe>`;
  return { snippet, hostedUrl };
}
