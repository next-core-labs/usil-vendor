import { useEffect, useState, type ChangeEvent } from 'react';
import { Modal } from '../ui/Modal.tsx';
import { Button, Field, Input } from '../ui/primitives.tsx';
import { emptyDraft, draftFromItem, sameCode, type InventoryDraft, type InventoryItem } from '../../lib/inventory.ts';

/** Add or edit one stock item. `item` null = add (optionally prefilled with a scanned code). */
export function ItemFormModal({
  open,
  item,
  barcode = '',
  items,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  item: InventoryItem | null;
  barcode?: string;
  items: InventoryItem[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: InventoryDraft) => void;
}) {
  const [draft, setDraft] = useState<InventoryDraft>(() => emptyDraft(barcode));

  useEffect(() => {
    if (open) setDraft(item ? draftFromItem(item) : emptyDraft(barcode));
  }, [open, item, barcode]);

  const set = <K extends keyof InventoryDraft>(key: K, value: InventoryDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setNum = (key: keyof InventoryDraft) => (event: ChangeEvent<HTMLInputElement>) =>
    set(key, (event.target.value === '' ? 0 : Number(event.target.value)) as never);

  const codeClash = draft.barcode.trim()
    ? items.find((other) => other.id !== item?.id && sameCode(other.barcode, draft.barcode))
    : undefined;
  const invalid = !draft.nameAr.trim() || !draft.unit.trim() || !!codeClash;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'تعديل الصنف' : 'صنف جديد'}
      description="الاستهلاك لكل ضيف هو اللي يحسب احتياج مناسباتك القادمة — خلّه صفر للأشياء اللي ما تُستهلك."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="primary" busy={busy} disabled={invalid} onClick={() => onSave(draft)}>
            {item ? 'حفظ التعديلات' : 'إضافة الصنف'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="اسم الصنف">
            <Input
              value={draft.nameAr}
              placeholder="أكواب ورقية 8oz"
              onChange={(event) => set('nameAr', event.target.value)}
            />
          </Field>
        </div>
        <Field label="الوحدة">
          <Input value={draft.unit} placeholder="حبة، كرتون، كجم" onChange={(event) => set('unit', event.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="الرصيد الحالي">
          <Input type="number" inputMode="decimal" min={0} className="tabular" value={draft.currentStock} onChange={setNum('currentStock')} />
        </Field>
        <Field label="حد الأمان" hint="أقل رصيد تبي يبقى عندك">
          <Input type="number" inputMode="decimal" min={0} className="tabular" value={draft.minStockThreshold} onChange={setNum('minStockThreshold')} />
        </Field>
        <Field label="تكلفة الوحدة (ر.س)">
          <Input type="number" inputMode="decimal" min={0} step="0.01" className="tabular" value={draft.unitCost} onChange={setNum('unitCost')} />
        </Field>
        <Field label="الاستهلاك لكل ضيف">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            className="tabular"
            value={draft.estimatedUsagePerGuest}
            onChange={setNum('estimatedUsagePerGuest')}
          />
        </Field>
        <Field label="مدة التوريد (أيام)">
          <Input type="number" inputMode="numeric" min={0} className="tabular" value={draft.leadTimeDays} onChange={setNum('leadTimeDays')} />
        </Field>
        <Field label="المورّد">
          <Input value={draft.supplierName} onChange={(event) => set('supplierName', event.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="الباركود" hint={codeClash ? `الرمز مسجّل على «${codeClash.nameAr}».` : undefined}>
          <Input
            dir="ltr"
            className="tabular text-start"
            value={draft.barcode}
            aria-invalid={!!codeClash}
            onChange={(event) => set('barcode', event.target.value)}
          />
        </Field>
        <Field label="موقع التخزين">
          <Input value={draft.location} placeholder="المستودع — رف 2" onChange={(event) => set('location', event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
