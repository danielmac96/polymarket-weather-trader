import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getTradingSettings,
  updateTradingSettings,
  RISK_PROFILES,
  UNIT_SIZE_MIN_USD,
  UNIT_SIZE_MAX_USD,
} from '@pwa/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const settings = await getTradingSettings();
  return NextResponse.json({ settings, profiles: RISK_PROFILES });
}

const Body = z.object({
  unitSizeUsd: z.number().min(UNIT_SIZE_MIN_USD).max(UNIT_SIZE_MAX_USD).optional(),
  riskTolerance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  autoTradeEnabled: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const settings = await updateTradingSettings(parsed.data);
  return NextResponse.json({ settings, profiles: RISK_PROFILES });
}
