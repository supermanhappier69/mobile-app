import { describe, expect, it } from 'vitest';
import {
  centsToInputString,
  divRound,
  formatMoney,
  parseMoneyToCents,
  percentOfCents,
  roundHalfAwayFromZero,
} from '../src/money';
import { computeTotals, depositCents, lineTotalCents, markupPct, priceFromMarkup, taxCents } from '../src/totals';
import { estimateCardFeeCents, platformFeeCents } from '../src/fees';

describe('money', () => {
  it('rounds half away from zero like Postgres round(numeric)', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(Object.is(roundHalfAwayFromZero(-0.4), -0)).toBe(false);
    expect(divRound(21715, 10)).toBe(2172);
    expect(() => divRound(1.5, 2)).toThrow();
  });

  it('parses money input into minor units without float drift', () => {
    expect(parseMoneyToCents('$1,250')).toBe(125000);
    expect(parseMoneyToCents('12.5')).toBe(1250);
    expect(parseMoneyToCents('£0.99')).toBe(99);
    expect(parseMoneyToCents('12.345')).toBe(1235);
    expect(parseMoneyToCents('12.344')).toBe(1234);
    expect(parseMoneyToCents('-3')).toBe(-300);
    expect(parseMoneyToCents('.5')).toBe(50);
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('1.2.3')).toBeNull();
  });

  it('formats for inputs and display', () => {
    expect(centsToInputString(1250)).toBe('12.50');
    expect(centsToInputString(-5)).toBe('-0.05');
    expect(formatMoney(125000, 'USD', 'en-US')).toBe('$1,250.00');
    expect(formatMoney(125000, 'GBP', 'en-GB')).toBe('£1,250.00');
    expect(formatMoney(125000, 'USD', 'en-US', { compact: true })).toBe('$1,250');
    expect(formatMoney(125050, 'USD', 'en-US', { compact: true })).toBe('$1,250.50');
    expect(percentOfCents(10000, 12.5)).toBe(1250);
  });
});

describe('totals', () => {
  const base = { taxable: true, optional: false, selected: true };

  it('computes line totals with 3-decimal quantities exactly', () => {
    // 2.15 × 1010 = 2171.5 → 2172 (float math would give 2171.4999…)
    expect(lineTotalCents({ qty: 2.15, unit_price_cents: 1010 })).toBe(2172);
    expect(lineTotalCents({ qty: 1.5, unit_price_cents: 8500 })).toBe(12750);
    expect(lineTotalCents({ qty: 3, unit_price_cents: null })).toBe(0);
    expect(lineTotalCents({ qty: 1, unit_price_cents: -2500 })).toBe(-2500);
  });

  it('excludes unselected optional and deleted lines, taxes only taxable lines', () => {
    const totals = computeTotals(
      [
        { ...base, qty: 1, unit_price_cents: 10000 },
        { ...base, qty: 2, unit_price_cents: 5000, taxable: false },
        { ...base, qty: 1, unit_price_cents: 9999, optional: true, selected: false },
        { ...base, qty: 1, unit_price_cents: 2000, optional: true, selected: true },
        { ...base, qty: 1, unit_price_cents: 7777, deleted_at: '2026-01-01T00:00:00Z' },
        { ...base, qty: 1, unit_price_cents: null },
      ],
      { taxMode: 'sales_tax', taxRate: 8.875, depositPct: 25 },
    );
    expect(totals.subtotal_cents).toBe(22000);
    expect(totals.taxable_cents).toBe(12000);
    expect(totals.tax_cents).toBe(1065); // 12000 × 8.875% = 1065
    expect(totals.total_cents).toBe(23065);
    expect(totals.deposit_cents).toBe(5766); // 23065 × 25% = 5766.25
    expect(totals.needs_price_count).toBe(1);
  });

  it('applies no tax when tax mode is none', () => {
    expect(taxCents(10000, 'none', 20)).toBe(0);
    expect(taxCents(10001, 'vat', 20)).toBe(2000);
    expect(taxCents(10003, 'vat', 20)).toBe(2001);
    expect(depositCents(10000, null)).toBe(0);
    expect(depositCents(10000, 150)).toBe(10000);
  });

  it('derives markups both ways', () => {
    expect(markupPct(10000, 15000)).toBe(50);
    expect(markupPct(0, 15000)).toBeNull();
    expect(priceFromMarkup(10000, 35)).toBe(13500);
  });
});

describe('fees', () => {
  it('computes the platform application fee in basis points', () => {
    expect(platformFeeCents(100000, 50)).toBe(500);
    expect(platformFeeCents(12345, 50)).toBe(62); // 61.725 → 62
    expect(platformFeeCents(0, 50)).toBe(0);
    expect(platformFeeCents(10000, 0)).toBe(0);
  });

  it('estimates card processing fees per country', () => {
    expect(estimateCardFeeCents(10000, 'US', 'online')).toBe(320);
    expect(estimateCardFeeCents(10000, 'GB', 'online')).toBe(170);
  });
});
