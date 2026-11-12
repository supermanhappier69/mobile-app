/**
 * Request/response contracts for Supabase Edge Functions. Requests are validated server-side with
 * these schemas; the app uses the same types to call them.
 */
import { z } from 'zod';
import { CHASE_TONES, IMPORT_SOURCES } from './enums';
import type { PaymentAccountStatus, Unit } from './enums';
import type { AiLineItem, AiQuoteDraft } from './ai';
import type { CustomerMapping } from './csv';
import type { DocumentRow, Payment } from './types';

export const FUNCTIONS = {
  aiDraftQuote: 'ai_draft_quote',
  aiItemsFromPhotos: 'ai_items_from_photos',
  aiMapCsv: 'ai_map_csv',
  aiDraftReminder: 'ai_draft_reminder',
  transcribe: 'transcribe',
  renderPdf: 'render_pdf',
  sendDocument: 'send_document',
  publicDocument: 'public_document',
  stripeConnect: 'stripe_connect',
  stripeTerminal: 'stripe_terminal',
  takePayment: 'take_payment',
  exportData: 'export_data',
  deleteAccount: 'delete_account',
} as const;

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

// ai_draft_quote ---------------------------------------------------------------------------------
export const aiDraftQuoteRequest = z.object({
  input_kind: z.enum(['voice', 'text']),
  transcript: z.string().trim().min(3).max(8000),
  document_id: z.uuid().nullish(),
});
export type AiDraftQuoteRequest = z.infer<typeof aiDraftQuoteRequest>;
export interface AiDraftQuoteResponse {
  draft_id: string;
  draft: AiQuoteDraft;
  warnings: string[];
  model: string;
}

// ai_items_from_photos ---------------------------------------------------------------------------
export const aiItemsFromPhotosRequest = z.object({
  photo_paths: z.array(z.string().min(1).max(500)).min(1).max(6),
  note: z.string().max(1000).nullish(),
  document_id: z.uuid().nullish(),
});
export type AiItemsFromPhotosRequest = z.infer<typeof aiItemsFromPhotosRequest>;
export interface AiItemsFromPhotosResponse {
  draft_id: string;
  line_items: AiLineItem[];
  observations: string[];
  warnings: string[];
  model: string;
}

// ai_map_csv --------------------------------------------------------------------------------------
export const aiMapCsvRequest = z.object({
  source: z.enum(IMPORT_SOURCES),
  headers: z.array(z.string().max(200)).min(1).max(60),
  sample_rows: z.array(z.array(z.string().max(500)).max(60)).max(5),
});
export type AiMapCsvRequest = z.infer<typeof aiMapCsvRequest>;
export interface AiMapCsvResponse {
  mapping: CustomerMapping;
  used_ai: boolean;
}

// ai_draft_reminder -------------------------------------------------------------------------------
export const aiDraftReminderRequest = z.object({
  document_id: z.uuid(),
  tone: z.enum(CHASE_TONES),
  channel: z.enum(['sms', 'email']),
});
export type AiDraftReminderRequest = z.infer<typeof aiDraftReminderRequest>;
export interface AiDraftReminderResponse {
  variants: string[];
  model: string;
}

// transcribe (multipart/form-data: `audio` file, optional `locale`) --------------------------------
export interface TranscribeResponse {
  text: string;
  duration_seconds: number | null;
  model: string;
}

// render_pdf --------------------------------------------------------------------------------------
export const renderPdfRequest = z.object({ document_id: z.uuid() });
export type RenderPdfRequest = z.infer<typeof renderPdfRequest>;
export interface RenderPdfResponse {
  pdf_path: string;
  signed_url: string;
  generated_at: string;
}

// send_document -----------------------------------------------------------------------------------
export const SEND_CHANNELS = ['sms', 'email', 'whatsapp', 'link'] as const;
export type SendChannel = (typeof SEND_CHANNELS)[number];
export const sendDocumentRequest = z.object({
  document_id: z.uuid(),
  channel: z.enum(SEND_CHANNELS),
  /** Phone or email override; defaults to the customer's. */
  to: z.string().max(200).nullish(),
  message: z.string().max(1000).nullish(),
  /** Onboarding "send to myself": creates the link/PDF without marking the document sent. */
  self_test: z.boolean().optional(),
});
export type SendDocumentRequest = z.infer<typeof sendDocumentRequest>;
export interface SendDocumentResponse {
  document: DocumentRow;
  public_url: string;
  /** Message text with the link, for the device SMS composer / share sheet. */
  message: string;
  sms_to: string | null;
  whatsapp_url: string | null;
  email_id: string | null;
  pdf_url: string | null;
}

// public_document (customer web page) -------------------------------------------------------------
export interface PublicLineItem {
  id: string;
  description: string;
  qty: number;
  unit: Unit;
  unit_price_cents: number;
  line_total_cents: number;
  taxable: boolean;
  optional: boolean;
  selected: boolean;
}

export interface PublicDocumentPayload {
  document: {
    id: string;
    kind: 'quote' | 'invoice';
    number: string | null;
    status: string;
    title: string;
    notes_customer: string | null;
    currency: string;
    locale: string;
    issued_at: string;
    expires_at: string | null;
    due_at: string | null;
    accepted_at: string | null;
    accepted_name: string | null;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    tax_label: string | null;
    tax_rate_bps: number;
    deposit_cents: number;
    amount_paid_cents: number;
    balance_cents: number;
    pdf_url: string | null;
    line_items: PublicLineItem[];
  };
  business: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    logo_url: string | null;
    brand_color: string | null;
  };
  customer: { first_name: string | null };
  payments: { enabled: boolean; fee_note: string | null };
  actions: { can_accept: boolean; can_decline: boolean; can_pay_deposit: boolean; can_pay_balance: boolean };
}

const token = z.string().min(16).max(128);
export const publicDocumentAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('view'), token }),
  z.object({
    action: z.literal('accept'),
    token,
    name: z.string().trim().min(2).max(120),
    signature: z.string().trim().min(2).max(120),
    selected_line_item_ids: z.array(z.uuid()).max(200),
  }),
  z.object({ action: z.literal('decline'), token, reason: z.string().max(500).nullish() }),
  z.object({ action: z.literal('checkout'), token, purpose: z.enum(['deposit', 'balance']) }),
]);
export type PublicDocumentAction = z.infer<typeof publicDocumentAction>;

// stripe_connect ----------------------------------------------------------------------------------
export const stripeConnectRequest = z.object({ action: z.enum(['onboard', 'status', 'dashboard']) });
export type StripeConnectRequest = z.infer<typeof stripeConnectRequest>;
export interface StripeConnectResponse {
  status: PaymentAccountStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
  url: string | null;
}

// stripe_terminal (Tap to Pay) --------------------------------------------------------------------
export const stripeTerminalRequest = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connection_token') }),
  z.object({ action: z.literal('location') }),
  z.object({
    action: z.literal('create_intent'),
    document_id: z.uuid(),
    amount_cents: z.number().int().positive(),
    tip_cents: z.number().int().min(0).default(0),
  }),
  z.object({ action: z.literal('cancel_intent'), payment_intent_id: z.string().min(3) }),
]);
export type StripeTerminalRequest = z.input<typeof stripeTerminalRequest>;
export type StripeTerminalResponse =
  | { secret: string }
  | { location_id: string }
  | { client_secret: string; payment_intent_id: string; application_fee_cents: number }
  | { cancelled: true };

// take_payment ------------------------------------------------------------------------------------
export const takePaymentRequest = z.discriminatedUnion('method', [
  z.object({
    method: z.enum(['cash', 'bank', 'other']),
    document_id: z.uuid(),
    amount_cents: z.number().int().positive(),
    reference: z.string().max(200).nullish(),
    received_at: z.iso.datetime().optional(),
    send_receipt: z.boolean().default(true),
  }),
  z.object({ method: z.literal('pay_link'), document_id: z.uuid() }),
]);
export type TakePaymentRequest = z.input<typeof takePaymentRequest>;
export interface TakePaymentResponse {
  document: DocumentRow;
  payment: Payment | null;
  pay_url: string | null;
  receipt_sent: boolean;
}

// export_data / delete_account --------------------------------------------------------------------
export interface ExportDataResponse {
  url: string;
  expires_at: string;
  files: number;
}

export const deleteAccountRequest = z.object({ confirm: z.literal('DELETE') });
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequest>;

// run_chase_jobs (cron) ---------------------------------------------------------------------------
export interface RunChaseJobsResponse {
  claimed: number;
  sent: number;
  deferred: number;
  skipped: number;
  failed: number;
}
