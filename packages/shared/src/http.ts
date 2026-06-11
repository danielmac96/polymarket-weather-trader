import { z, type ZodSchema } from 'zod';
import { createLogger } from './logger.js';

const log = createLogger('http');

export interface FetchJsonOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  retryBaseMs?: number;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly bodyPreview: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T>(
  url: string,
  schema: ZodSchema<T>,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 10_000,
    retries = 3,
    retryBaseMs = 500,
  } = opts;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const init: RequestInit = {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        signal: ctrl.signal,
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      const res = await fetch(url, init);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const preview = text.slice(0, 500);
        // Retry on 5xx and 429; do not retry other 4xx.
        if ((res.status >= 500 || res.status === 429) && attempt < retries) {
          const wait = retryBaseMs * 2 ** attempt;
          log.warn(
            { url, status: res.status, attempt, wait, preview },
            'http retryable failure',
          );
          await sleep(wait);
          continue;
        }
        throw new HttpError(res.status, url, preview);
      }

      const text = await res.text();
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        log.error({ url, preview: text.slice(0, 500) }, 'invalid json');
        throw new Error(`Invalid JSON from ${url}`);
      }

      const result = schema.safeParse(parsedJson);
      if (!result.success) {
        log.error(
          { url, issues: result.error.issues },
          'response failed schema validation',
        );
        throw new Error(`Response from ${url} failed schema validation`);
      }
      return result.data;
    } catch (err) {
      lastErr = err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const isNetwork =
        err instanceof TypeError ||
        (err instanceof Error && /fetch failed|network/i.test(err.message));
      const retryable = isAbort || isNetwork;
      if (retryable && attempt < retries) {
        const wait = retryBaseMs * 2 ** attempt;
        log.warn({ url, attempt, wait, err: String(err) }, 'http retry');
        await sleep(wait);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export { z };
