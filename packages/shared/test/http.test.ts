import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetchJson, HttpError } from '../src/http.js';
import { resetConfigForTesting } from '../src/config.js';

const ORIGINAL_ENV = { ...process.env };

const Schema = z.object({ ok: z.boolean(), n: z.number() });

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchJson', () => {
  beforeEach(() => {
    resetConfigForTesting();
    process.env = { ...ORIGINAL_ENV, DATABASE_URL: 'postgresql://x:y@localhost:5432/z' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetConfigForTesting();
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns parsed JSON on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { ok: true, n: 42 })),
    );
    const result = await fetchJson('https://example.com/x', Schema, { retries: 0 });
    expect(result).toEqual({ ok: true, n: 42 });
  });

  it('retries on 500 and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { e: 'fail' }))
      .mockResolvedValueOnce(jsonResponse(500, { e: 'fail' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, n: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchJson('https://example.com/x', Schema, {
      retries: 3,
      retryBaseMs: 1,
    });
    expect(result).toEqual({ ok: true, n: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 400', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(400, { e: 'bad' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      fetchJson('https://example.com/x', Schema, { retries: 3, retryBaseMs: 1 }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws if response fails schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { ok: 'nope', n: 'x' })),
    );
    await expect(
      fetchJson('https://example.com/x', Schema, { retries: 0 }),
    ).rejects.toThrow(/schema validation/);
  });
});
