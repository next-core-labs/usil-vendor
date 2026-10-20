import { api } from './client.ts';
import { office } from './office.ts';
import type { VendorBooking } from './types.ts';
import { normalizeItems, restockExpense, type InventoryItem, type RestockInput } from '../lib/inventory.ts';

type WorkspaceSlice = { inventoryItems?: unknown; bookings?: VendorBooking[] };
type Wrapped<T> = { data: T };

export type InventoryData = { items: InventoryItem[]; bookings: VendorBooking[] };

const readWorkspace = () => api.get<Wrapped<WorkspaceSlice>>('/api/vendor/workspace').then((r) => r.data ?? {});

/**
 * Inventory is the `inventoryItems` section of the vendor workspace.
 *
 * PUT /api/vendor/workspace replaces only the sections it is sent
 * (`saveVendorWorkspace` in vendor-store.ts), so every save sends
 * `{ inventoryItems }` alone — bookings, listings and the office are never
 * touched from here.
 */
export const inventory = {
  load: async (): Promise<InventoryData> => {
    const ws = await readWorkspace();
    return { items: normalizeItems(ws.inventoryItems), bookings: Array.isArray(ws.bookings) ? ws.bookings : [] };
  },

  /**
   * Read the latest list, apply `change`, save it. Reading first means an edit
   * made on another device since this screen loaded is kept, not overwritten.
   */
  mutate: async (change: (items: InventoryItem[]) => InventoryItem[]): Promise<InventoryItem[]> => {
    const fresh = normalizeItems((await readWorkspace()).inventoryItems);
    const next = change(fresh);
    const saved = await api.put<Wrapped<WorkspaceSlice>>('/api/vendor/workspace', { inventoryItems: next });
    return normalizeItems(saved.data?.inventoryItems ?? next);
  },

  /** Appends the restock to the office `expenses` list (PATCH replaces only that key). */
  recordExpense: async (item: InventoryItem, input: RestockInput) => {
    const current = await office.read();
    const existing = Array.isArray(current.expenses) ? current.expenses : [];
    const expense = restockExpense(item, input, existing as Array<{ voucherNumber?: unknown }>);
    await office.patch({ expenses: [...existing, expense] });
    return expense;
  },
};
