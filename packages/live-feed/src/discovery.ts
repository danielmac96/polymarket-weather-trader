import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  createLogger,
  fetchJson,
  getDb,
  loadConfig,
  schema,
} from '@pwa/shared';
import { isUsWeatherMarket, matchesFocus } from './filters.js';

const log = createLogger('discovery');

// Polymarket Gamma API market shape — only the fields we use, all permissive.
const GammaMarket = z.object({
  id: z.union([z.string(), z.number()]),
  conditionId: z.string().optional(),
  question: z.string(),
  slug: z.string().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  endDate: z.string().optional(),
  endDateIso: z.string().optional(),
  end_date_iso: z.string().optional(),
  clobTokenIds: z.union([z.array(z.string()), z.string()]).optional(),
  volume: z.union([z.string(), z.number()]).optional(),
  liquidity: z.union([z.string(), z.number()]).optional(),
});

const GammaResponse = z.array(GammaMarket);

function normalizeClobTokenIds(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  if (Array.isArray(v)) return v;
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface DiscoveredMarket {
  marketId: string;
  question: string;
  endDate: Date | null;
  clobTokenIdYes: string | null;
  clobTokenIdNo: string | null;
}

function parseEndDate(m: z.infer<typeof GammaMarket>): Date | null {
  const raw = m.endDate ?? m.endDateIso ?? m.end_date_iso;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function fetchActiveMarkets(): Promise<DiscoveredMarket[]> {
  const cfg = loadConfig();
  const url =
    'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=500';
  const data = await fetchJson(url, GammaResponse);
  log.info({ count: data.length }, 'gamma returned markets');

  const accept = (question: string): boolean =>
    cfg.FOCUS_ENABLED
      ? matchesFocus(question, cfg.FOCUS_QUERY, cfg.FOCUS_LOCATION)
      : isUsWeatherMarket(question);

  const filtered: DiscoveredMarket[] = [];
  for (const m of data) {
    if (!accept(m.question)) continue;
    const tokens = normalizeClobTokenIds(m.clobTokenIds);
    const [yes, no] = tokens;
    filtered.push({
      marketId: String(m.id),
      question: m.question,
      endDate: parseEndDate(m),
      clobTokenIdYes: yes ?? null,
      clobTokenIdNo: no ?? null,
    });
  }
  log.info(
    { matched: filtered.length, total: data.length, focus: cfg.FOCUS_ENABLED },
    cfg.FOCUS_ENABLED
      ? `filtered to focus: ${cfg.FOCUS_QUERY} @ ${cfg.FOCUS_LOCATION}`
      : 'filtered to US weather',
  );
  return filtered;
}

export interface DiscoveryResult {
  discovered: number;
  upserted: number;
  closed: number;
}

export async function runDiscoveryOnce(): Promise<DiscoveryResult> {
  const startedAt = Date.now();
  const discovered = await fetchActiveMarkets();
  const db = getDb();
  const now = new Date();

  for (const m of discovered) {
    await db
      .insert(schema.polymarketMarkets)
      .values({
        marketId: m.marketId,
        question: m.question,
        endDate: m.endDate,
        clobTokenIdYes: m.clobTokenIdYes,
        clobTokenIdNo: m.clobTokenIdNo,
        region: 'US',
        status: 'ACTIVE',
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.polymarketMarkets.marketId,
        set: {
          question: m.question,
          endDate: m.endDate,
          clobTokenIdYes: m.clobTokenIdYes,
          clobTokenIdNo: m.clobTokenIdNo,
          status: 'ACTIVE',
          lastSeenAt: now,
          updatedAt: now,
        },
      });
  }

  // Mark previously-active markets that didn't appear this round as CLOSED.
  let closedCount = 0;
  const seenIds = discovered.map((m) => m.marketId);
  const result = await db
    .update(schema.polymarketMarkets)
    .set({ status: 'CLOSED', updatedAt: now })
    .where(
      and(
        eq(schema.polymarketMarkets.status, 'ACTIVE'),
        seenIds.length > 0
          ? sql`${schema.polymarketMarkets.marketId} not in (${sql.join(
              seenIds.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : sql`true`,
      ),
    )
    .returning({ id: schema.polymarketMarkets.id });
  closedCount = result.length;

  log.info(
    {
      discovered: discovered.length,
      upserted: discovered.length,
      closed: closedCount,
      durationMs: Date.now() - startedAt,
    },
    'discovery complete',
  );

  return {
    discovered: discovered.length,
    upserted: discovered.length,
    closed: closedCount,
  };
}

export async function loadActiveMarketsFromDb(): Promise<
  Array<{
    id: string;
    marketId: string;
    clobTokenIdYes: string | null;
    clobTokenIdNo: string | null;
  }>
> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.polymarketMarkets.id,
      marketId: schema.polymarketMarkets.marketId,
      clobTokenIdYes: schema.polymarketMarkets.clobTokenIdYes,
      clobTokenIdNo: schema.polymarketMarkets.clobTokenIdNo,
    })
    .from(schema.polymarketMarkets)
    .where(eq(schema.polymarketMarkets.status, 'ACTIVE'));
  return rows;
}

export { isUsWeatherMarket };
// Re-export to silence "unused import" linter where consumers want filters.
export { inArray };
