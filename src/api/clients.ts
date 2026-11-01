import { office, type VendorOffice } from './office.ts';
import { normalizeClient, type VendorClient } from '../components/clients/model.ts';

/**
 * «عملائي» — the `clients` list in the vendor's office (`/api/vendor/office`).
 * Like the finance lists, each write re-reads the server's list first and
 * patches only this key, so a second device's additions are never dropped.
 */

function clientsOf(data: VendorOffice): VendorClient[] {
  return (data.clients || []).map((row, index) => normalizeClient(row, index)).filter((row): row is VendorClient => Boolean(row));
}

/** Same fallback as the normalizer: a row without an id is known by its position. */
const idOf = (row: unknown, index: number) => {
  const id = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined;
  return id ? String(id) : `row-${index}`;
};

async function mutate(change: (raw: unknown[]) => unknown[]): Promise<VendorClient[]> {
  const fresh = await office.read();
  const next = change(Array.isArray(fresh.clients) ? [...fresh.clients] : []);
  return office.patch({ clients: next }).then(clientsOf);
}

export const clients = {
  list: () => office.read().then(clientsOf),
  /** Insert or replace by id; a new client goes first. */
  save: (row: VendorClient) =>
    mutate((list) => {
      const index = list.findIndex((item, i) => idOf(item, i) === row.id);
      if (index < 0) return [row, ...list];
      const copy = [...list];
      copy[index] = { ...(copy[index] as object), ...row };
      return copy;
    }),
  remove: (id: string) => mutate((list) => list.filter((item, i) => idOf(item, i) !== id)),
};
