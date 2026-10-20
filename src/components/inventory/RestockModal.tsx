import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal.tsx';
import { Button, Field, Input, Select } from '../ui/primitives.tsx';
import { count, sar } from '../../lib/format.ts';
import {
  PAYMENT_LABEL,
  splitPaid,
  type InventoryItem,
  type PaymentMethod,
  type RestockInput,
} from '../../lib/inventory.ts';

/**
 * A purchase from a supplier: adds the stock and, by default, records the
 * money as an `inventory_supplies` expense in the office ledger.
 */
export function RestockModal({
  item,
  suggestedQty,
  busy,
  onClose,
  onSave,
}: {
  item: InventoryItem | null;
  suggestedQty: number;
  busy: boolean;
  onClose: () => void;
  onSave: (item: InventoryItem, input: RestockInput, recordExpense: boolean) => void;
}) {
  const [qty, setQty] = useState('');
  const [paid, setPaid] = useState('');
  const [paidEdited, setPaidEdited] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [vatIncluded, setVatIncluded] = useState(false);
  const [recordExpense, setRecordExpense] = useState(true);

  useEffect(() => {
    if (!item) return;
    const start = suggestedQty > 0 ? suggestedQty : Math.max(1, item.minStockThreshold);
    setQty(String(start));
    setPaid(item.unitCost > 0 ? String(Math.round(start * item.unitCost * 100) / 100) : '');
    setPaidEdited(false);
    setSupplier(item.supplierName || '');
    setNotes('');
    setMethod('bank_transfer');
    setVatIncluded(false);
    setRecordExpense(true);
  }, [item, suggestedQty]);

  if (!item) return null;

  const quantity = Math.max(0, Number(qty) || 0);
  const totalPaid = Math.max(0, Number(paid) || 0);
  const split = splitPaid(totalPaid, vatIncluded);
  const invalid = quantity <= 0 || (recordExpense && totalPaid <= 0);

  return (
    <Modal
      open
      onClose={onClose}
      title={`توريد: ${item.nameAr}`}
      description={`الرصيد الحالي ${count(item.currentStock)} ${item.unit} — بعد التوريد ${count(item.currentStock + quantity)} ${item.unit}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={invalid}
            onClick={() =>
              onSave(
                item,
                { quantity, totalPaid, vatIncluded, supplierName: supplier, paymentMethod: method, notes },
                recordExpense,
              )
            }
          >
            {recordExpense ? 'تأكيد التوريد والمصروف' : 'تأكيد التوريد'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={`الكمية (${item.unit})`}>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            className="tabular"
            value={qty}
            onChange={(event) => {
              setQty(event.target.value);
              if (!paidEdited && item.unitCost > 0) {
                const next = Math.max(0, Number(event.target.value) || 0);
                setPaid(String(Math.round(next * item.unitCost * 100) / 100));
              }
            }}
          />
        </Field>
        <Field label="المبلغ المدفوع (ر.س)">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="tabular"
            value={paid}
            onChange={(event) => {
              setPaid(event.target.value);
              setPaidEdited(true);
            }}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="المورّد">
          <Input value={supplier} onChange={(event) => setSupplier(event.target.value)} />
        </Field>
        <Field label="طريقة الدفع">
          <Select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((key) => (
              <option key={key} value={key}>
                {PAYMENT_LABEL[key]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="ملاحظات أو رقم فاتورة المورّد">
        <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>

      <div className="space-y-2">
        <label className="flex items-start gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2.5">
          <input
            type="checkbox"
            checked={recordExpense}
            onChange={(event) => setRecordExpense(event.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span className="text-[13px] leading-6 text-ink">
            سجّل المبلغ كمصروف
            <span className="block text-xs text-ink-muted">يُضاف لمصروفاتك تحت «توريدات ومستلزمات المخزون».</span>
          </span>
        </label>
        {recordExpense ? (
          <label className="flex items-start gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2.5">
            <input
              type="checkbox"
              checked={vatIncluded}
              onChange={(event) => setVatIncluded(event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--accent)]"
            />
            <span className="text-[13px] leading-6 text-ink">
              المبلغ يشمل ضريبة القيمة المضافة 15٪
              {vatIncluded && totalPaid > 0 ? (
                <span className="tabular block text-xs text-ink-muted">
                  صافي {sar(split.amount)} + ضريبة {sar(split.taxAmount)}
                </span>
              ) : null}
            </span>
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
