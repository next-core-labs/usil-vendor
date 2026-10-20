import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Modal } from '../ui/Modal.tsx';
import { FilterTabs } from '../ui/Table.tsx';
import { Button, Field, Input } from '../ui/primitives.tsx';
import { count } from '../../lib/format.ts';
import type { InventoryItem } from '../../lib/inventory.ts';

type Mode = 'remove' | 'add' | 'count';

const MODE_HINT: Record<Mode, string> = {
  remove: 'كمية صُرفت أو استُهلكت أو تلفت.',
  add: 'كمية رجعت للمستودع. لو شريتها من مورّد استخدم «توريد» عشان يُسجَّل المصروف.',
  count: 'نتيجة الجرد الفعلي — يصير هذا هو الرصيد.',
};

/** Quick stock correction without money: consume, return, or set the counted figure. */
export function AdjustStockModal({
  item,
  busy,
  onClose,
  onSave,
  onRestock,
}: {
  item: InventoryItem | null;
  busy: boolean;
  onClose: () => void;
  onSave: (item: InventoryItem, nextStock: number) => void;
  onRestock: (item: InventoryItem) => void;
}) {
  const [mode, setMode] = useState<Mode>('remove');
  const [qty, setQty] = useState('1');

  useEffect(() => {
    if (item) {
      setMode('remove');
      setQty('1');
    }
  }, [item]);

  if (!item) return null;

  const amount = Math.max(0, Number(qty) || 0);
  const next =
    mode === 'count' ? amount : mode === 'add' ? item.currentStock + amount : Math.max(0, item.currentStock - amount);
  const unchanged = next === item.currentStock || qty.trim() === '';

  return (
    <Modal
      open
      onClose={onClose}
      title={`تعديل رصيد: ${item.nameAr}`}
      description={`الرصيد الحالي ${count(item.currentStock)} ${item.unit}${item.location ? ` · ${item.location}` : ''}`}
      footer={
        <>
          <Button variant="ghost" icon={<ShoppingCart size={15} />} onClick={() => onRestock(item)} disabled={busy}>
            توريد مع مصروف
          </Button>
          <Button variant="primary" busy={busy} disabled={unchanged} onClick={() => onSave(item, next)}>
            حفظ الرصيد
          </Button>
        </>
      }
    >
      <FilterTabs<Mode>
        value={mode}
        onChange={(value) => {
          setMode(value);
          setQty(value === 'count' ? String(item.currentStock) : '1');
        }}
        options={[
          { value: 'remove', label: 'صرف' },
          { value: 'add', label: 'إضافة' },
          { value: 'count', label: 'جرد' },
        ]}
      />

      <Field label={mode === 'count' ? `الرصيد الفعلي (${item.unit})` : `الكمية (${item.unit})`} hint={MODE_HINT[mode]}>
        <div className="flex items-center gap-2">
          {mode !== 'count' ? (
            <Button
              variant="secondary"
              aria-label="إنقاص"
              onClick={() => setQty(String(Math.max(0, amount - 1)))}
              className="w-10 shrink-0 px-0"
            >
              −
            </Button>
          ) : null}
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            className="tabular text-center"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
          />
          {mode !== 'count' ? (
            <Button variant="secondary" aria-label="زيادة" onClick={() => setQty(String(amount + 1))} className="w-10 shrink-0 px-0">
              +
            </Button>
          ) : null}
        </div>
      </Field>

      {mode !== 'count' ? (
        <div className="flex flex-wrap gap-2">
          {[5, 10, 25, 50].map((step) => (
            <Button key={step} size="sm" variant="ghost" className="tabular" onClick={() => setQty(String(step))}>
              {count(step)}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-lg border border-line bg-sunken px-4 py-3 text-sm">
        <span className="text-ink-secondary">الرصيد بعد الحفظ</span>
        <span className="tabular font-semibold text-ink">
          {count(next)} {item.unit}
        </span>
      </div>
    </Modal>
  );
}
