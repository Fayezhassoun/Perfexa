import { describe, expect, it } from 'vitest';
import { leadsToCsv } from '../src/services/leads.js';
import { scoreLead } from '../src/tools.js';
import type { Lead } from '@sayso/db';

function lead(partial: Partial<Lead>): Lead {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    orgId: '00000000-0000-0000-0000-000000000002',
    formId: null,
    sourceCampaignId: null,
    name: null,
    email: null,
    phone: null,
    customFields: null,
    score: 0,
    status: 'new',
    notes: null,
    createdAt: new Date('2026-01-02T03:04:05Z'),
    updatedAt: null,
    ...partial,
  } as Lead;
}

describe('leadsToCsv', () => {
  it('renders header + rows', () => {
    const csv = leadsToCsv([lead({ name: 'Ada', email: 'ada@corp.com', score: 70 })]);
    const [header, row] = csv.split('\n');
    expect(header).toBe('name,email,phone,score,status,source_campaign_id,notes,created_at');
    expect(row).toContain('Ada,ada@corp.com,,70,new,');
  });

  it('escapes quotes, commas, and newlines', () => {
    const csv = leadsToCsv([lead({ name: 'Smith, "Bob"', notes: 'line1\nline2' })]);
    expect(csv).toContain('"Smith, ""Bob"""');
    expect(csv).toContain('"line1\nline2"');
  });
});

describe('scoreLead', () => {
  it('scores phone + business email + campaign source highest', () => {
    expect(scoreLead({ phone: '555', email: 'x@corp.com', sourceCampaignId: 'c1' })).toBe(100);
  });
  it('free-mail email scores lower than a business domain', () => {
    expect(scoreLead({ email: 'x@gmail.com' })).toBeLessThan(scoreLead({ email: 'x@corp.com' }));
  });
  it('empty lead scores 0', () => {
    expect(scoreLead({})).toBe(0);
  });
});
