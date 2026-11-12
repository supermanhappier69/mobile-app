import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHASE_STEPS,
  buildChaseVariables,
  firstName,
  isQuietHours,
  nextAllowedSendTime,
  planChaseJobs,
  renderTemplate,
  smsOptOutSuffix,
  zonedTimeToUtc,
} from '../src/chase';
import { canTransition, deriveInvoiceStatus, dueDateFor, isEditable } from '../src/status';

describe('chase templates', () => {
  it('renders variables and tidies whitespace', () => {
    expect(renderTemplate('Hi {first_name},  pay {amount_due} here: {link} .{missing}', {
      first_name: 'Dave',
      amount_due: '$120.00',
      link: 'https://x/i/abc',
    })).toBe('Hi Dave, pay $120.00 here: https://x/i/abc.');
    expect(firstName('  Dave   Moreno ')).toBe('Dave');
    expect(firstName(null)).toBe('there');
  });

  it('builds reminder variables with days overdue and a late-fee notice', () => {
    const vars = buildChaseVariables({
      customerName: 'Sarah Jones',
      businessName: 'Pipes & Co',
      title: 'Boiler service',
      number: 'INV-0007',
      balanceCents: 20000,
      currency: 'GBP',
      locale: 'en-GB',
      dueAt: '2026-11-01T09:00:00Z',
      link: 'https://jobsheet.app/i/tok',
      lateFee: { enabled: true, kind: 'percent', amount: 5 },
      now: new Date('2026-11-15T10:00:00Z'),
      timeZone: 'Europe/London',
    });
    expect(vars.first_name).toBe('Sarah');
    expect(vars.days_overdue).toBe('14');
    expect(vars.amount_due).toBe('£200.00');
    expect(vars.due_date).toBe('1 Nov 2026');
    expect(vars.late_fee_notice).toContain('£10.00');
    const text = renderTemplate(DEFAULT_CHASE_STEPS[2]!.template, vars);
    expect(text).toContain('14 days overdue. A late fee of £10.00');
    expect(text.endsWith('Pipes & Co')).toBe(true);
  });

  it('adds SMS opt-out language only where carriers require it', () => {
    expect(smsOptOutSuffix('US')).toContain('STOP');
    expect(smsOptOutSuffix('GB')).toBe('');
  });
});

describe('quiet hours', () => {
  const ny = 'America/New_York';

  it('detects quiet hours in the tenant time zone', () => {
    expect(isQuietHours(new Date('2026-11-13T02:00:00Z'), ny)).toBe(true); // 21:00 EST
    expect(isQuietHours(new Date('2026-11-12T11:00:00Z'), ny)).toBe(true); // 06:00 EST
    expect(isQuietHours(new Date('2026-11-12T15:00:00Z'), ny)).toBe(false); // 10:00 EST
    expect(isQuietHours(new Date('2026-11-12T15:00:00Z'), ny, 9, 9)).toBe(false);
  });

  it('defers evening sends to 08:00 the next local day and early sends to 08:00 the same day', () => {
    expect(nextAllowedSendTime(new Date('2026-11-13T02:00:00Z'), ny).toISOString()).toBe('2026-11-13T13:00:00.000Z');
    expect(nextAllowedSendTime(new Date('2026-11-12T11:00:00Z'), ny).toISOString()).toBe('2026-11-12T13:00:00.000Z');
    const ok = new Date('2026-11-12T15:00:00Z');
    expect(nextAllowedSendTime(ok, ny)).toBe(ok);
  });

  it('handles DST transitions', () => {
    // 2026-03-08 01:00 EST (before the 02:00 spring-forward) → 08:00 EDT = 12:00Z
    expect(nextAllowedSendTime(new Date('2026-03-08T06:00:00Z'), ny).toISOString()).toBe('2026-03-08T12:00:00.000Z');
    // London BST: 2026-07-01 21:30 BST → 08:00 BST next day = 07:00Z
    expect(nextAllowedSendTime(new Date('2026-07-01T20:30:00Z'), 'Europe/London').toISOString()).toBe('2026-07-02T07:00:00.000Z');
    expect(zonedTimeToUtc(2026, 11, 1, 8, 0, ny).toISOString()).toBe('2026-11-01T13:00:00.000Z');
  });

  it('plans default chase jobs from the due date, respecting quiet hours', () => {
    const anchor = new Date('2026-11-12T01:30:00Z'); // 20:30 EST on 11 Nov
    const jobs = planChaseJobs(anchor, DEFAULT_CHASE_STEPS, ny);
    expect(jobs.map((j) => j.step_index)).toEqual([0, 1, 2]);
    expect(jobs.map((j) => j.tone)).toEqual(['friendly', 'firm', 'final']);
    // +1 day lands at 20:30 local (quiet) → 08:00 next day
    expect(jobs[0]!.scheduled_for.toISOString()).toBe('2026-11-13T13:00:00.000Z');
  });
});

describe('document status', () => {
  const invoice = { status: 'unpaid' as const, total_cents: 10000, amount_paid_cents: 0, due_at: '2026-11-20T00:00:00Z', sent_at: '2026-11-10T00:00:00Z' };

  it('derives invoice status from payments and due date', () => {
    const now = new Date('2026-11-15T00:00:00Z');
    expect(deriveInvoiceStatus(invoice, now)).toBe('unpaid');
    expect(deriveInvoiceStatus({ ...invoice, amount_paid_cents: 4000 }, now)).toBe('partially_paid');
    expect(deriveInvoiceStatus({ ...invoice, amount_paid_cents: 10000 }, now)).toBe('paid');
    expect(deriveInvoiceStatus(invoice, new Date('2026-11-21T00:00:00Z'))).toBe('overdue');
    expect(deriveInvoiceStatus({ ...invoice, status: 'void' }, now)).toBe('void');
    expect(deriveInvoiceStatus({ ...invoice, status: 'draft', sent_at: null }, now)).toBe('draft');
  });

  it('limits client-initiated transitions', () => {
    expect(canTransition('quote', 'viewed', 'accepted')).toBe(true);
    expect(canTransition('quote', 'draft', 'accepted')).toBe(false);
    expect(canTransition('invoice', 'unpaid', 'paid')).toBe(false);
    expect(isEditable({ kind: 'invoice', status: 'partially_paid', amount_paid_cents: 100 })).toBe(false);
    expect(dueDateFor('net_14', new Date('2026-11-01T00:00:00Z')).toISOString()).toBe('2026-11-15T00:00:00.000Z');
  });
});
