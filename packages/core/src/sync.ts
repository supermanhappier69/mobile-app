/**
 * Offline sync contract shared by the app (outbox/rebase) and the server (`sync_push` / `sync_pull`).
 *
 * - Clients write rows locally and append patches (changed columns only) to an outbox.
 * - The server applies each patch with per-field last-write-wins using `field_clock` (a per-row map of
 *   column → client timestamp). Fields in SERVER_WINS_ON_CONFLICT are dropped when the client's
 *   base_version is stale. Server-owned columns are never accepted from clients.
 * - The server returns the authoritative row; the client replaces its copy and re-applies any
 *   still-pending patches for that row (rebase).
 */

export const SYNC_TABLES = [
  'tenants',
  'customers',
  'price_book_items',
  'documents',
  'line_items',
  'photos',
  'chase_sequences',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Server-written tables the client only pulls. */
export const PULL_ONLY_TABLES = ['payments', 'chase_jobs', 'events'] as const;
export type PullOnlyTable = (typeof PULL_ONLY_TABLES)[number];
export type PullTable = SyncTable | PullOnlyTable;
export const PULL_TABLES: readonly PullTable[] = [...SYNC_TABLES, ...PULL_ONLY_TABLES];

export const CLIENT_WRITABLE_COLUMNS: Record<SyncTable, readonly string[]> = {
  tenants: [
    'name',
    'trade',
    'country',
    'currency',
    'locale',
    'timezone',
    'tax_mode',
    'tax_rate_default',
    'tax_registration_number',
    'logo_path',
    'address',
    'phone',
    'email',
    'brand_color',
    'default_due_terms',
    'quote_expiry_days',
    'quote_prefix',
    'invoice_prefix',
    'chase_defaults',
    'pass_fees_to_customer',
  ],
  customers: ['name', 'phone', 'email', 'address', 'notes', 'source', 'external_ref'],
  price_book_items: ['name', 'category', 'unit', 'unit_cost_cents', 'unit_price_cents', 'markup_pct', 'taxable', 'synonyms'],
  documents: [
    'kind',
    'status',
    'customer_id',
    'source_quote_id',
    'title',
    'notes_customer',
    'notes_internal',
    'currency',
    'tax_mode',
    'tax_rate',
    'deposit_pct',
    'due_terms',
    'due_at',
    'expires_at',
    'scheduled_for',
    'completed_at',
    'ai_draft_id',
    'chase_paused',
  ],
  line_items: [
    'document_id',
    'position',
    'description',
    'qty',
    'unit',
    'unit_price_cents',
    'taxable',
    'optional',
    'selected',
    'price_book_item_id',
    'ai_confidence',
    'ai_inferred',
  ],
  photos: ['document_id', 'customer_id', 'storage_path', 'taken_at', 'caption', 'kind'],
  chase_sequences: ['name', 'steps', 'is_default'],
};

/** Accepted on insert, ignored on later updates. */
export const INSERT_ONLY_COLUMNS: Partial<Record<SyncTable, readonly string[]>> = {
  documents: ['kind', 'source_quote_id', 'currency'],
  line_items: ['document_id'],
};

/** On a stale base_version these client values are dropped in favour of the server's. */
export const SERVER_WINS_ON_CONFLICT: Partial<Record<SyncTable, readonly string[]>> = {
  documents: ['status'],
};

export type MutationOp = 'upsert' | 'delete';

export interface Mutation {
  /** Outbox entry id — lets the server and client correlate results. */
  id: string;
  table: SyncTable;
  op: MutationOp;
  row_id: string;
  patch: Record<string, unknown>;
  /** Row version the client last saw; null for a row created offline. */
  base_version: number | null;
  /** Device time of the edit (ISO). */
  client_updated_at: string;
}

export type MutationOutcome = 'applied' | 'merged' | 'rejected';

export interface MutationResult {
  mutation_id: string;
  table: SyncTable;
  row_id: string;
  outcome: MutationOutcome;
  /** Authoritative server row after the mutation (null when rejected and the row does not exist). */
  row: Record<string, unknown> | null;
  dropped_fields: string[];
  error: string | null;
}

export interface PullRequest {
  /** Per-table high-water marks (server `updated_at`). */
  since: Partial<Record<PullTable, string | null>>;
  limit?: number;
}

export interface PullResponse {
  rows: Partial<Record<PullTable, Record<string, unknown>[]>>;
  /** New high-water marks to store for the next pull. */
  cursors: Partial<Record<PullTable, string>>;
  has_more: boolean;
}

/** Overlap re-pulled on every sync so rows committed slightly out of timestamp order are not missed. */
export const PULL_OVERLAP_MS = 10_000;

export function filterWritable(table: SyncTable, patch: Record<string, unknown>, isInsert: boolean): Record<string, unknown> {
  const allowed = new Set(CLIENT_WRITABLE_COLUMNS[table]);
  const insertOnly = new Set(INSERT_ONLY_COLUMNS[table] ?? []);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) continue;
    if (!isInsert && insertOnly.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Re-applies still-pending local patches on top of an authoritative server row. */
export function rebase<T extends Record<string, unknown>>(serverRow: T, pending: readonly Record<string, unknown>[]): T {
  let row: Record<string, unknown> = { ...serverRow };
  for (const patch of pending) row = { ...row, ...patch };
  return row as T;
}

/**
 * Reference implementation of the server merge (the SQL in `sync_push` is authoritative; tests keep
 * both in step). Returns the columns to write and the updated field clock.
 */
export function mergePatch(
  table: SyncTable,
  current: { version: number; field_clock: Record<string, string> },
  mutation: Pick<Mutation, 'patch' | 'base_version' | 'client_updated_at'>,
): { apply: Record<string, unknown>; fieldClock: Record<string, string>; dropped: string[]; conflict: boolean } {
  const conflict = mutation.base_version == null || mutation.base_version !== current.version;
  const serverWins = new Set(conflict ? (SERVER_WINS_ON_CONFLICT[table] ?? []) : []);
  const writable = filterWritable(table, mutation.patch, false);
  const apply: Record<string, unknown> = {};
  const dropped: string[] = [];
  const clock = { ...current.field_clock };
  const ts = Date.parse(mutation.client_updated_at);
  for (const [key, value] of Object.entries(writable)) {
    const prev = clock[key];
    if (serverWins.has(key) || (prev != null && Date.parse(prev) > ts)) {
      dropped.push(key);
      continue;
    }
    apply[key] = value;
    clock[key] = mutation.client_updated_at;
  }
  return { apply, fieldClock: clock, dropped, conflict };
}
