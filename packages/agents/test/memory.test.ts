import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addMemory,
  deleteMemory,
  importFile,
  importText,
  importUrl,
  listMemory,
  searchMemory,
} from '../src/services/memory.js';
import { db, freshOrg, truncateAll } from './helpers.js';

describe('business memory service', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('addMemory stores a row scoped to the org with a non-null embedding', async () => {
    const { ctx, orgId } = await freshOrg();
    const doc = await addMemory(ctx, {
      title: 'Pricing Guide 2026',
      content: 'Our standard HVAC repair rate is $150 per hour with a $75 diagnostic fee.',
      tags: ['pricing', 'services'],
    });

    expect(doc.id).toBeDefined();
    expect(doc.orgId).toBe(orgId);
    expect(doc.title).toBe('Pricing Guide 2026');
    expect(doc.content).toContain('$150 per hour');
    expect(doc.kind).toBe('note');
    expect(doc.tags).toEqual(['pricing', 'services']);
    expect(doc.embedding).toBeDefined();
    expect(Array.isArray(doc.embedding)).toBe(true);
    expect(doc.embedding!.length).toBeGreaterThan(0);

    const list = await listMemory(ctx);
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(doc.id);
  });

  it('searchMemory ranks a relevant doc above an irrelevant one', async () => {
    const { ctx } = await freshOrg();
    const doc1 = await addMemory(ctx, {
      title: 'Emergency Plumbing Services',
      content: 'We offer 24/7 emergency pipe repair, leak detection, and drain cleaning in Chicago.',
      tags: ['plumbing'],
    });

    const doc2 = await addMemory(ctx, {
      title: 'Bakery Menu and Pastries',
      content: 'Fresh sourdough bread, croissants, chocolate muffins, and custom birthday cakes.',
      tags: ['bakery'],
    });

    const hits = await searchMemory(ctx, 'pipe leak repair emergency plumber');
    expect(hits.length).toBe(2);
    expect(hits[0]!.id).toBe(doc1.id);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it('listMemory for org A never returns org B rows (confirm memory is org-scoped)', async () => {
    const orgA = await freshOrg();
    const orgB = await freshOrg();

    const docA = await addMemory(orgA.ctx, {
      title: 'Org A Confidential Note',
      content: 'Org A internal strategy and financial forecasts.',
    });

    const docB = await addMemory(orgB.ctx, {
      title: 'Org B Secret Plan',
      content: 'Org B expansion plans into new markets.',
    });

    const listA = await listMemory(orgA.ctx);
    const listB = await listMemory(orgB.ctx);

    expect(listA.map((d) => d.id)).toEqual([docA.id]);
    expect(listA.some((d) => d.id === docB.id)).toBe(false);

    expect(listB.map((d) => d.id)).toEqual([docB.id]);
    expect(listB.some((d) => d.id === docA.id)).toBe(false);

    // Also check searchMemory isolation
    const searchA = await searchMemory(orgA.ctx, 'expansion plans secret');
    expect(searchA.some((h) => h.id === docB.id)).toBe(false);
  });

  it('deleteMemory refuses/ignores a cross-org id', async () => {
    const orgA = await freshOrg();
    const orgB = await freshOrg();

    const docB = await addMemory(orgB.ctx, {
      title: 'Org B Document',
      content: 'Some data for org B',
    });

    // Org A attempts to delete Org B's doc
    const res = await deleteMemory(orgA.ctx, docB.id);
    expect(res.deleted).toBe(false);

    // Verify Org B doc still exists
    const listB = await listMemory(orgB.ctx);
    expect(listB.length).toBe(1);
    expect(listB[0]!.id).toBe(docB.id);

    // Org B deleting its own doc succeeds
    const resB = await deleteMemory(orgB.ctx, docB.id);
    expect(resB.deleted).toBe(true);
    const listBAfter = await listMemory(orgB.ctx);
    expect(listBAfter.length).toBe(0);
  });

  it('importUrl against a stubbed global fetch stores stripped text + title (no HTML tags)', async () => {
    const { ctx } = await freshOrg();

    const fakeHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>About Our Plumbing Company</title>
          <style>body { color: red; }</style>
          <script>console.log("analytics");</script>
        </head>
        <body>
          <h1>Welcome to Best Plumbers</h1>
          <p>We provide <b>top quality</b> residential plumbing services.</p>
        </body>
      </html>
    `;

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => fakeHtml,
    } as unknown as Response);

    try {
      const doc = await importUrl(ctx, {
        url: 'https://example.com/about',
        tags: ['web-import'],
      });

      expect(doc.title).toBe('About Our Plumbing Company');
      expect(doc.kind).toBe('url');
      expect(doc.sourceMeta).toEqual({ url: 'https://example.com/about' });
      expect(doc.tags).toEqual(['web-import']);
      expect(doc.content).not.toContain('<title>');
      expect(doc.content).not.toContain('<script>');
      expect(doc.content).not.toContain('<style>');
      expect(doc.content).not.toContain('console.log');
      expect(doc.content).toContain('Welcome to Best Plumbers We provide top quality residential plumbing services.');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('importText and importFile helper methods work as expected', async () => {
    const { ctx } = await freshOrg();

    const note = await importText(ctx, {
      title: 'Pasted Note',
      text: 'Simple note content',
      tags: ['quick'],
    });
    expect(note.kind).toBe('note');
    expect(note.title).toBe('Pasted Note');

    const file = await importFile(ctx, {
      filename: 'services.csv',
      mimeType: 'text/csv',
      text: 'service,price\nrepair,100',
      tags: ['csv-import'],
    });
    expect(file.kind).toBe('file');
    expect(file.title).toBe('services.csv');
    expect(file.sourceMeta).toEqual({
      filename: 'services.csv',
      mimeType: 'text/csv',
      sizeBytes: 24,
    });

  });
});
