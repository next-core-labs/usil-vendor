import { office, type VendorOffice } from './office.ts';
import { normalizeExpense, type ExpenseRecord } from '../lib/finance.ts';
import { normalizeQuotation, type Quotation } from '../components/quotations/model.ts';

/**
 * The expenses and quotations lists kept in the vendor's office
 * (`/api/vendor/office`). Writes go through `office.patch` with only this
 * screen's key, and each write re-reads the list first — the inventory screen
 * appends to `expenses` too, so saving a stale copy would drop its rows.
 */

/** What the print and share views show about the vendor. All optional. */
export type BrandInfo = {
  brandName: string;
  phone: string;
  email: string;
  city: string;
  address: string;
  crNumber: string;
  vatNumber: string;
  logoUrl: string;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function brandFromOffice(data: VendorOffice): BrandInfo {
  const raw = (data.brandSettings || {}) as Record<string, unknown>;
  return {
    brandName: text(raw.brandName),
    phone: text(raw.phone),
    email: text(raw.email),
    city: text(raw.city),
    address: text(raw.address),
    crNumber: text(raw.crNumber),
    vatNumber: text(raw.vatNumber),
    logoUrl: text(raw.logoUrl),
  };
}

function expensesOf(data: VendorOffice): ExpenseRecord[] {
  return (data.expenses || []).map((row, index) => normalizeExpense(row, index)).filter((row): row is ExpenseRecord => Boolean(row));
}

function quotationsOf(data: VendorOffice): Quotation[] {
  return (data.quotations || []).map((row, index) => normalizeQuotation(row, index)).filter((row): row is Quotation => Boolean(row));
}

/**
 * Applies `change` to the server's current list (not the screen's copy) and
 * saves it. Rows another screen added meanwhile survive; rows are matched by id.
 */
async function mutate(key: 'expenses' | 'quotations', change: (raw: unknown[]) => unknown[]): Promise<VendorOffice> {
  const fresh = await office.read();
  const next = change(Array.isArray(fresh[key]) ? [...(fresh[key] as unknown[])] : []);
  return office.patch({ [key]: next });
}

/** Same fallback as the normalizers: a row without an id is known by its position. */
const idOf = (row: unknown, index: number) => {
  const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined;
  return id ? String(id) : `row-${index}`;
};

/** Insert or replace by id; a new row goes first. */
function upsert(list: unknown[], row: { id: string }): unknown[] {
  const index = list.findIndex((item, i) => idOf(item, i) === row.id);
  if (index < 0) return [row, ...list];
  const copy = [...list];
  copy[index] = { ...(copy[index] as object), ...row };
  return copy;
}

export const finance = {
  /** The whole office once: expenses, quotations and the brand header. */
  load: async () => {
    const data = await office.read();
    return { expenses: expensesOf(data), quotations: quotationsOf(data), brand: brandFromOffice(data) };
  },
  saveExpense: (row: ExpenseRecord) =>
    mutate('expenses', (list) => upsert(list, row)).then(expensesOf),
  /** `build` gets the server's current list, so a voucher number is never reused. */
  addExpense: async (build: (current: ExpenseRecord[]) => ExpenseRecord) => {
    const fresh = await office.read();
    const raw = Array.isArray(fresh.expenses) ? fresh.expenses : [];
    const row = build(expensesOf(fresh));
    return office.patch({ expenses: [row, ...raw] }).then(expensesOf);
  },
  removeExpense: (id: string) =>
    mutate('expenses', (list) => list.filter((item, i) => idOf(item, i) !== id)).then(expensesOf),
  saveQuotation: (row: Quotation) =>
    mutate('quotations', (list) => upsert(list, row)).then(quotationsOf),
  addQuotation: async (build: (current: Quotation[]) => Quotation) => {
    const fresh = await office.read();
    const raw = Array.isArray(fresh.quotations) ? fresh.quotations : [];
    const row = build(quotationsOf(fresh));
    return office.patch({ quotations: [row, ...raw] }).then(quotationsOf);
  },
  removeQuotation: (id: string) =>
    mutate('quotations', (list) => list.filter((item, i) => idOf(item, i) !== id)).then(quotationsOf),
};
