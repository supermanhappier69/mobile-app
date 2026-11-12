import { describe, expect, it } from 'vitest';
import {
  aiQuoteDraftSchema,
  confidenceBand,
  evidenceInTranscript,
  extractSpokenAmounts,
  groundLineItems,
  postProcessQuoteDraft,
  quoteDraftJsonSchema,
  transcriptMentionsAmount,
  type AiLineItem,
} from '../src/ai';
import { filterWritable, mergePatch, rebase } from '../src/sync';
import { applyCustomerMapping, guessCustomerMapping, parseCsv, toCsv } from '../src/csv';
import { formatPhone, normalizePhone } from '../src/phone';
import { newId } from '../src/ids';

const transcript =
  "ok so this is for dave moreno at 14 elm street um the water heater's leaking so we're swapping the fifty gallon gas tank and uh call it two fifty for the labor and i'll haul the old one away. not touching the drywall";

const priceBook = [
  { id: 'pb-heater', name: '50 gal gas water heater', unit: 'each' as const, unit_price_cents: 145000, category: 'Water heaters', synonyms: ['fifty gallon', 'gas tank'] },
  { id: 'pb-haul', name: 'Disposal / haul-away', unit: 'each' as const, unit_price_cents: 7500, category: 'Disposal', synonyms: ['haul away'] },
];

function item(overrides: Partial<AiLineItem>): AiLineItem {
  return {
    description: 'Item',
    qty: 1,
    unit: 'each',
    unit_price_cents: null,
    price_book_item_id: null,
    needs_price: true,
    optional: false,
    inferred: false,
    confidence: 0.9,
    evidence: null,
    ...overrides,
  };
}

describe('AI output schema', () => {
  it('accepts a valid draft and rejects malformed ones', () => {
    const draft = {
      title: 'Replace gas water heater',
      customer: { name: 'Dave Moreno', phone: null, address: '14 Elm Street' },
      line_items: [item({ description: 'Install 50 gal gas water heater', price_book_item_id: 'pb-heater', unit_price_cents: 145000, needs_price: false, evidence: 'swapping the fifty gallon gas tank' })],
      deposit_pct: null,
      notes_customer: null,
      questions_for_tradesperson: [],
    };
    expect(aiQuoteDraftSchema.safeParse(draft).success).toBe(true);
    expect(aiQuoteDraftSchema.safeParse({ ...draft, line_items: [item({ qty: 0 })] }).success).toBe(false);
    expect(aiQuoteDraftSchema.safeParse({ ...draft, line_items: [{ ...item({}), unit: 'litre' }] }).success).toBe(false);
    const schema = quoteDraftJsonSchema() as { properties?: Record<string, unknown> };
    expect(Object.keys(schema.properties ?? {})).toContain('line_items');
  });

  it('maps confidence to the spec bands', () => {
    expect(confidenceBand(0.8)).toBe('high');
    expect(confidenceBand(0.65)).toBe('medium');
    expect(confidenceBand(0.49)).toBe('low');
    expect(confidenceBand(null)).toBe('low');
  });
});

describe('spoken amounts', () => {
  it('understands how tradespeople say prices', () => {
    expect(extractSpokenAmounts('call it two fifty for the labor')).toContain(250);
    expect(extractSpokenAmounts('a hundred and twenty quid')).toContain(120);
    expect(extractSpokenAmounts('fifteen hundred all in')).toContain(1500);
    expect(extractSpokenAmounts('it was $1,250 last time')).toContain(1250);
    expect(extractSpokenAmounts('about 2k')).toContain(2000);
    expect(extractSpokenAmounts('eighty five an hour')).toContain(85);
    expect(extractSpokenAmounts('one twenty five per outlet')).toContain(125);
    expect(extractSpokenAmounts('a grand for the panel')).toContain(1000);
    expect(transcriptMentionsAmount(transcript, 25000)).toBe(true);
    expect(transcriptMentionsAmount(transcript, 99900)).toBe(false);
  });

  it('matches evidence loosely against the transcript', () => {
    expect(evidenceInTranscript("Swapping the fifty-gallon gas tank", transcript)).toBe(true);
    expect(evidenceInTranscript('replace the boiler', transcript)).toBe(false);
    expect(evidenceInTranscript(null, transcript)).toBe(false);
  });
});

describe('grounding AI line items', () => {
  it('fills, keeps, resets or clears prices according to the price-book and transcript', () => {
    const { value, warnings } = groundLineItems(
      [
        item({ description: 'Gas water heater', price_book_item_id: 'pb-heater', evidence: 'the fifty gallon gas tank' }),
        item({ description: 'Labour', unit: 'hour', unit_price_cents: 25000, evidence: 'call it two fifty for the labor' }),
        item({ description: 'Haul away old heater', price_book_item_id: 'pb-haul', unit_price_cents: 9900, evidence: "i'll haul the old one away" }),
        item({ description: 'Expansion tank', unit_price_cents: 18000, evidence: 'expansion tank' }),
        item({ description: 'Ghost item', price_book_item_id: 'pb-unknown', evidence: 'the water heater' }),
      ],
      { transcript, priceBook, requireEvidence: true },
    );
    expect(value[0]).toMatchObject({ unit_price_cents: 145000, needs_price: false });
    expect(value[1]).toMatchObject({ unit_price_cents: 25000, needs_price: false });
    expect(value[2]).toMatchObject({ unit_price_cents: 7500 });
    expect(value[3]).toMatchObject({ unit_price_cents: null, needs_price: true, optional: true, inferred: true });
    expect(value[3]!.confidence).toBeLessThanOrEqual(0.3);
    expect(value[4]).toMatchObject({ price_book_item_id: null, needs_price: true });
    expect(warnings.length).toBeGreaterThanOrEqual(4);
  });

  it('marks inferred items optional and titles empty drafts', () => {
    const { value } = postProcessQuoteDraft(
      {
        title: '  ',
        customer: { name: null, phone: null, address: null },
        line_items: [item({ description: 'Disposal', inferred: true, optional: false, price_book_item_id: 'pb-haul', evidence: null })],
        deposit_pct: null,
        notes_customer: null,
        questions_for_tradesperson: [],
      },
      { transcript, priceBook },
    );
    expect(value.title).toBe('Quote');
    expect(value.line_items[0]).toMatchObject({ optional: true, inferred: true, unit_price_cents: 7500 });
  });
});

describe('sync merge rules', () => {
  it('never accepts server-owned columns and ignores insert-only columns on update', () => {
    const patch = { title: 'New', number: 'Q-9', amount_paid_cents: 1, tenant_id: 'x', kind: 'invoice', status: 'void' };
    expect(filterWritable('documents', patch, false)).toEqual({ title: 'New', status: 'void' });
    expect(filterWritable('documents', patch, true)).toEqual({ title: 'New', kind: 'invoice', status: 'void' });
  });

  it('applies per-field last-write-wins and server-wins status on conflict', () => {
    const current = { version: 5, field_clock: { title: '2026-11-12T10:00:00.000Z', notes_internal: '2026-11-12T08:00:00.000Z' } };
    const fresh = mergePatch('documents', current, {
      base_version: 5,
      client_updated_at: '2026-11-12T11:00:00.000Z',
      patch: { title: 'A', status: 'accepted' },
    });
    expect(fresh).toMatchObject({ conflict: false, apply: { title: 'A', status: 'accepted' }, dropped: [] });

    const stale = mergePatch('documents', current, {
      base_version: 3,
      client_updated_at: '2026-11-12T09:00:00.000Z',
      patch: { title: 'Old title', notes_internal: 'newer note', status: 'void' },
    });
    expect(stale.conflict).toBe(true);
    expect(stale.apply).toEqual({ notes_internal: 'newer note' });
    expect(stale.dropped.sort()).toEqual(['status', 'title']);
    expect(stale.fieldClock.notes_internal).toBe('2026-11-12T09:00:00.000Z');
  });

  it('rebases pending local patches over the server row', () => {
    expect(rebase({ id: '1', title: 'server', notes: 'n' }, [{ title: 'local' }, { notes: 'local n' }])).toEqual({ id: '1', title: 'local', notes: 'local n' });
  });
});

describe('csv import/export', () => {
  it('parses quoted fields, escaped quotes, CRLF and BOM', () => {
    const rows = parseCsv('\uFEFFName,Notes\r\n"Moreno, Dave","said ""hi""\nthen left"\r\n\r\nAnn,\n');
    expect(rows).toEqual([['Name', 'Notes'], ['Moreno, Dave', 'said "hi"\nthen left'], ['Ann', '']]);
  });

  it('maps typical competitor exports to customers', () => {
    const rows = parseCsv('First Name,Last Name,Mobile Phone,Email Address,Street Address,City,State,Zip\nDave,Moreno,(555) 010-0100,DAVE@EXAMPLE.COM,14 Elm St,Springfield,IL,62701\n,,,,,,,\n');
    const mapping = guessCustomerMapping(rows[0]!);
    expect(mapping['Mobile Phone']).toBe('mobile');
    expect(mapping['Zip']).toBe('postcode');
    const result = applyCustomerMapping(rows, mapping, 'US');
    expect(result.customers[0]).toMatchObject({
      name: 'Dave Moreno',
      phone: '+15550100100',
      email: 'dave@example.com',
      address: { line1: '14 Elm St', city: 'Springfield', region: 'IL', postcode: '62701', country: 'US' },
    });
    const missing = applyCustomerMapping([['Email'], ['x@y.com']], { Email: 'email' }, 'US');
    expect(missing.errors).toEqual([{ row: 2, message: 'Missing name' }]);
  });

  it('escapes CSV output', () => {
    expect(toCsv(['a', 'b'], [{ a: 'x,y', b: 'say "hi"' }])).toBe('a,b\r\n"x,y","say ""hi"""\r\n');
  });
});

describe('phone numbers and ids', () => {
  it('normalises to E.164 for launch countries', () => {
    expect(normalizePhone('(555) 010-0100', 'US')).toBe('+15550100100');
    expect(normalizePhone('07700 900123', 'GB')).toBe('+447700900123');
    expect(normalizePhone('0412 345 678', 'AU')).toBe('+61412345678');
    expect(normalizePhone('+44 7700 900123', 'US')).toBe('+447700900123');
    expect(normalizePhone('12', 'US')).toBeNull();
    expect(formatPhone('+15550100100', 'US')).toBe('(555) 010-0100');
    expect(formatPhone('+447700900123', 'GB')).toBe('07700 900123');
  });

  it('creates v4 uuids', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
