export const TRADES = ['plumbing', 'electrical', 'hvac', 'handyman', 'other'] as const;
export type Trade = (typeof TRADES)[number];

export const COUNTRIES = ['US', 'GB', 'CA', 'AU'] as const;
export type Country = (typeof COUNTRIES)[number];

export const CURRENCIES = ['USD', 'GBP', 'CAD', 'AUD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const TAX_MODES = ['none', 'sales_tax', 'vat'] as const;
export type TaxMode = (typeof TAX_MODES)[number];

/** `sqm` is an addition to the spec's unit list so GB/AU area work can be priced in square metres. */
export const UNITS = ['each', 'hour', 'm', 'sqm', 'ft', 'sqft', 'visit'] as const;
export type Unit = (typeof UNITS)[number];

export const DOCUMENT_KINDS = ['quote', 'invoice'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'scheduled',
  'done',
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'void',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'scheduled', 'done', 'void'] as const;
export const INVOICE_STATUSES = ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'void'] as const;

export const DUE_TERMS = ['on_receipt', 'net_7', 'net_14', 'net_30'] as const;
export type DueTerms = (typeof DUE_TERMS)[number];

export const PAYMENT_PROVIDERS = ['stripe_link', 'stripe_terminal', 'cash', 'bank', 'other'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_ACCOUNT_STATUSES = ['not_connected', 'pending', 'restricted', 'active'] as const;
export type PaymentAccountStatus = (typeof PAYMENT_ACCOUNT_STATUSES)[number];

export const CHASE_CHANNELS = ['sms', 'email', 'both'] as const;
export type ChaseChannel = (typeof CHASE_CHANNELS)[number];

export const CHASE_TONES = ['friendly', 'firm', 'final'] as const;
export type ChaseTone = (typeof CHASE_TONES)[number];

/** `sending` is the claimed state that makes the scheduler idempotent under concurrent runs. */
export const CHASE_JOB_STATUSES = ['pending', 'sending', 'sent', 'skipped', 'cancelled', 'failed'] as const;
export type ChaseJobStatus = (typeof CHASE_JOB_STATUSES)[number];

export const PHOTO_KINDS = ['before', 'after', 'receipt', 'other'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const USER_ROLES = ['owner', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CUSTOMER_SOURCES = ['manual', 'import', 'contacts'] as const;
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number];

export const AI_INPUT_KINDS = ['voice', 'text', 'photo'] as const;
export type AiInputKind = (typeof AI_INPUT_KINDS)[number];

export const CONSENT_KINDS = ['ai_processing', 'terms', 'privacy', 'session_replay', 'marketing'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export const IMPORT_SOURCES = ['contacts', 'csv_generic', 'csv_joist', 'csv_invoice_simple'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const IMPORT_STATUSES = ['pending', 'mapping', 'importing', 'done', 'failed'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const EVENT_ACTORS = ['user', 'customer', 'system', 'stripe', 'scheduler', 'store'] as const;
export type EventActor = (typeof EVENT_ACTORS)[number];

export const EVENT_TYPES = [
  'created',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'converted_to_invoice',
  'status_changed',
  'pdf_generated',
  'payment_received',
  'payment_failed',
  'payment_refunded',
  'chase_scheduled',
  'chase_sent',
  'chase_failed',
  'chase_skipped',
  'chase_paused',
  'chase_resumed',
  'chase_edited',
  'receipt_sent',
  'voided',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const SUBSCRIPTION_STATUSES = [
  'active',
  'in_grace_period',
  'in_billing_retry',
  'paused',
  'cancelled',
  'expired',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const ENTITLEMENTS = ['solo', 'team'] as const;
export type Entitlement = (typeof ENTITLEMENTS)[number];

export const PRODUCT_IDS = ['solo_monthly_1999', 'solo_annual_14900', 'team_monthly_3900', 'team_annual_34900'] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];
