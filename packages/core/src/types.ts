import type {
  AiInputKind,
  ChaseChannel,
  ChaseJobStatus,
  ChaseTone,
  ConsentKind,
  Country,
  CustomerSource,
  DocumentKind,
  DocumentStatus,
  DueTerms,
  EventActor,
  ImportSource,
  ImportStatus,
  PaymentAccountStatus,
  PaymentProvider,
  PaymentStatus,
  PhotoKind,
  SubscriptionStatus,
  TaxMode,
  Trade,
  Unit,
  UserRole,
} from './enums';

/** ISO-8601 timestamp string (timestamptz on the server). */
export type Iso = string;

/** Columns carried by every offline-synced table. */
export interface SyncedRow {
  id: string;
  tenant_id: string;
  created_at: Iso;
  updated_at: Iso;
  deleted_at: Iso | null;
  client_updated_at: Iso | null;
  version: number;
}

export interface Address {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
}

export interface LateFeeSettings {
  enabled: boolean;
  kind: 'flat' | 'percent';
  /** Minor units when flat, percent when percent. */
  amount: number;
}

export interface ChaseDefaults {
  enabled: boolean;
  quiet_start_hour: number;
  quiet_end_hour: number;
  late_fee: LateFeeSettings;
}

export interface Tenant extends SyncedRow {
  name: string;
  trade: Trade;
  country: Country;
  currency: string;
  locale: string;
  timezone: string;
  tax_mode: TaxMode;
  /** Percent with up to 3 decimals (8.875 = 8.875%). */
  tax_rate_default: number;
  tax_registration_number: string | null;
  logo_path: string | null;
  address: Address | null;
  phone: string | null;
  email: string | null;
  brand_color: string | null;
  default_due_terms: DueTerms;
  quote_expiry_days: number;
  quote_prefix: string;
  invoice_prefix: string;
  chase_defaults: ChaseDefaults;
  pass_fees_to_customer: boolean;
  // Server-owned below this line.
  locked_price_cents: number | null;
  locked_price_product_id: string | null;
  price_locked_at: Iso | null;
  payment_account_status: PaymentAccountStatus;
  stripe_account_id: string | null;
  platform_fee_bps: number;
  trial_started_at: Iso;
  trial_ends_at: Iso;
  paused_until: Iso | null;
  onboarding_completed_at: Iso | null;
}

export interface AppUser {
  id: string;
  tenant_id: string;
  auth_user_id: string;
  role: UserRole;
  display_name: string | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface Customer extends SyncedRow {
  name: string;
  phone: string | null;
  email: string | null;
  address: Address | null;
  notes: string | null;
  source: CustomerSource;
  external_ref: string | null;
}

export interface PriceBookItem extends SyncedRow {
  name: string;
  category: string | null;
  unit: Unit;
  unit_cost_cents: number;
  unit_price_cents: number;
  markup_pct: number | null;
  taxable: boolean;
  usage_count: number;
  last_used_at: Iso | null;
  synonyms: string[];
  starter_key: string | null;
}

export interface Acceptance {
  name: string;
  signature: string;
  ip: string | null;
  user_agent: string | null;
  accepted_at: Iso;
  selected_line_item_ids: string[];
}

export interface DocumentRow extends SyncedRow {
  kind: DocumentKind;
  number: string | null;
  status: DocumentStatus;
  customer_id: string | null;
  source_quote_id: string | null;
  title: string;
  notes_customer: string | null;
  notes_internal: string | null;
  currency: string;
  tax_mode: TaxMode;
  tax_rate: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_pct: number | null;
  deposit_cents: number;
  amount_paid_cents: number;
  due_terms: DueTerms | null;
  due_at: Iso | null;
  expires_at: Iso | null;
  scheduled_for: Iso | null;
  completed_at: Iso | null;
  accepted_at: Iso | null;
  acceptance: Acceptance | null;
  declined_at: Iso | null;
  decline_reason: string | null;
  sent_at: Iso | null;
  viewed_at: Iso | null;
  paid_at: Iso | null;
  public_token: string | null;
  pdf_path: string | null;
  pdf_generated_at: Iso | null;
  ai_draft_id: string | null;
  chase_paused: boolean;
}

export interface LineItem extends SyncedRow {
  document_id: string;
  position: number;
  description: string;
  qty: number;
  unit: Unit;
  /** null = still needs a price (AI could not ground it in the price-book). */
  unit_price_cents: number | null;
  taxable: boolean;
  optional: boolean;
  selected: boolean;
  price_book_item_id: string | null;
  ai_confidence: number | null;
  ai_inferred: boolean;
}

export interface Photo extends SyncedRow {
  document_id: string | null;
  customer_id: string | null;
  /** Null until the background upload completes. */
  storage_path: string | null;
  taken_at: Iso | null;
  caption: string | null;
  kind: PhotoKind;
}

export interface Payment {
  id: string;
  tenant_id: string;
  document_id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  currency: string;
  amount_cents: number;
  tip_cents: number;
  fee_cents: number;
  platform_fee_cents: number;
  refunded_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  reference: string | null;
  received_at: Iso;
  payout_id: string | null;
  created_at: Iso;
  updated_at: Iso;
  version: number;
}

export interface ChaseStep {
  day_offset: number;
  channel: ChaseChannel;
  tone: ChaseTone;
  template: string;
  email_subject?: string;
}

export interface ChaseSequence extends SyncedRow {
  name: string;
  steps: ChaseStep[];
  is_default: boolean;
}

export interface ChaseJob {
  id: string;
  tenant_id: string;
  document_id: string;
  sequence_id: string | null;
  step_index: number;
  tone: ChaseTone;
  channel: ChaseChannel;
  scheduled_for: Iso;
  status: ChaseJobStatus;
  paused: boolean;
  message_body: string | null;
  email_subject: string | null;
  attempts: number;
  last_error: string | null;
  claimed_at: Iso | null;
  sent_at: Iso | null;
  created_at: Iso;
  updated_at: Iso;
  version: number;
}

export interface EventRow {
  id: string;
  tenant_id: string;
  document_id: string | null;
  customer_id: string | null;
  type: string;
  actor: EventActor;
  payload: Record<string, unknown>;
  created_at: Iso;
  updated_at: Iso;
  version: number;
}

export interface AiDraft {
  id: string;
  tenant_id: string;
  document_id: string | null;
  input_kind: AiInputKind;
  transcript: string | null;
  raw_response: unknown;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_cents: number;
  accepted: boolean | null;
  edits_count: number | null;
  created_at: Iso;
  updated_at: Iso;
}

export interface SubscriptionMirror {
  id: string;
  tenant_id: string;
  entitlement: string;
  product_id: string;
  status: SubscriptionStatus;
  store: string;
  is_trial: boolean;
  period_type: string | null;
  will_renew: boolean;
  expires_at: Iso | null;
  original_purchase_at: Iso | null;
  billing_issue_at: Iso | null;
  updated_at: Iso;
}

export interface Consent {
  id: string;
  tenant_id: string;
  user_id: string;
  kind: ConsentKind;
  version: string;
  granted_at: Iso;
  revoked_at: Iso | null;
}

export interface ImportRow {
  id: string;
  tenant_id: string;
  source: ImportSource;
  status: ImportStatus;
  mapping: Record<string, string | null>;
  rows_ok: number;
  rows_failed: number;
  error: string | null;
  created_at: Iso;
  updated_at: Iso;
}
