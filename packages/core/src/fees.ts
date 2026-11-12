import { divRound } from './money';
import type { Country } from './enums';

export const DEFAULT_PLATFORM_FEE_BPS = 50;

/** application_fee_amount = round(amount × fee_bps / 10000). */
export function platformFeeCents(amountCents: number, feeBps: number = DEFAULT_PLATFORM_FEE_BPS): number {
  if (amountCents <= 0 || feeBps <= 0) return 0;
  return divRound(amountCents * Math.round(feeBps), 10_000);
}

export type CardChannel = 'online' | 'in_person';

/**
 * Stripe's standard (Stripe-handled pricing) card rates, used only to *estimate* processing fees for
 * the fee note shown to customers. Source: https://stripe.com/pricing (and country pages), Nov 2026.
 */
const CARD_RATES: Record<Country, Record<CardChannel, { bps: number; fixed: number }>> = {
  US: { online: { bps: 290, fixed: 30 }, in_person: { bps: 270, fixed: 15 } },
  GB: { online: { bps: 150, fixed: 20 }, in_person: { bps: 140, fixed: 10 } },
  CA: { online: { bps: 290, fixed: 30 }, in_person: { bps: 270, fixed: 15 } },
  AU: { online: { bps: 170, fixed: 30 }, in_person: { bps: 170, fixed: 10 } },
};

export function estimateCardFeeCents(amountCents: number, country: Country, channel: CardChannel): number {
  const rate = CARD_RATES[country][channel];
  return divRound(amountCents * rate.bps, 10_000) + rate.fixed;
}

export function cardFeeNote(country: Country, channel: CardChannel = 'online'): string {
  const rate = CARD_RATES[country][channel];
  const symbol = country === 'GB' ? 'p' : '¢';
  return `Card payments include a processing fee of about ${rate.bps / 100}% + ${rate.fixed}${symbol}.`;
}
