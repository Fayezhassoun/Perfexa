import { describe, expect, it, vi } from 'vitest';
import { createMockVideoAdapter, createFalVideoAdapter, getVideoAdapter } from '../src/video.js';

describe('video adapter', () => {
  describe('mock video adapter', () => {
    it('returns a deterministic completed job', async () => {
      const adapter = createMockVideoAdapter();
      const input = { prompt: 'A sleek product showcase of running shoes', style: 'product_demo', aspectRatio: '9:16', durationSec: 15 };
      const job1 = await adapter.generate(input);
      const job2 = await adapter.generate(input);

      expect(job1.status).toBe('completed');
      expect(job1.provider).toBe('mock');
      expect(job1.resultUrl).toBe(job2.resultUrl);
      expect(job1.resultUrl).toMatch(/^https:\/\/cdn\.sayso\.dev\/mock\/.*\.mp4$/);
      expect(job1.thumbnailUrl).toMatch(/^https:\/\/cdn\.sayso\.dev\/mock\/.*_thumb\.jpg$/);
      expect(job1.costCents).toBe(15);
      expect(job1.jobId).toBe(job2.jobId);
    });

    it('factory returns mock adapter by default', () => {
      const adapter = getVideoAdapter();
      expect(adapter.provider).toBe('mock');
    });
  });

  describe('fal video adapter', () => {
    it('hits fal.ai endpoint with correct headers/body and maps response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          request_id: 'fal-req-123',
          video: { url: 'https://fal.media/files/video.mp4' },
          thumbnail: { url: 'https://fal.media/files/thumb.jpg' },
          cost_cents: 45,
        }),
      });

      const adapter = createFalVideoAdapter({ apiKey: 'test-fal-key', fetch: mockFetch as unknown as typeof fetch });
      const input = { prompt: 'Cinematic coffee pouring', style: 'cinematic', aspectRatio: '16:9', durationSec: 10 };
      const res = await adapter.generate(input);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('https://fal.run/fal-ai/hunyuan-video');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Key test-fal-key',
      });
      const parsedBody = JSON.parse(init.body as string);
      expect(parsedBody).toEqual({
        prompt: 'Cinematic coffee pouring',
        aspect_ratio: '16:9',
        duration: 10,
        style: 'cinematic',
      });

      expect(res.jobId).toBe('fal-req-123');
      expect(res.status).toBe('completed');
      expect(res.resultUrl).toBe('https://fal.media/files/video.mp4');
      expect(res.thumbnailUrl).toBe('https://fal.media/files/thumb.jpg');
      expect(res.costCents).toBe(45);
      expect(res.provider).toBe('fal');
    });

    it('handles fal.ai error responses gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' }),
      });

      const adapter = createFalVideoAdapter({ apiKey: 'invalid-key', fetch: mockFetch as unknown as typeof fetch });
      const res = await adapter.generate({ prompt: 'Test error' });

      expect(res.status).toBe('failed');
      expect(res.provider).toBe('fal');
      expect(res.error).toBe('Invalid API key');
    });
  });
});
