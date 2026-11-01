import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field, Input, Select, Textarea } from '../ui/primitives.tsx';
import { Modal } from '../ui/Modal.tsx';
import { PLACE_NAMES } from '../../data/saudiPlaces.ts';
import {
  CLIENT_KINDS,
  CLIENT_KIND_LABEL,
  CLIENT_SOURCES,
  CLIENT_SOURCE_LABEL,
  clientWithPhone,
  type ClientKind,
  type ClientSource,
  type VendorClient,
} from './model.ts';

/** The fields the form owns; id and dates are added by the screen. */
export type ClientDraft = Omit<VendorClient, 'id' | 'createdAt' | 'updatedAt'>;

type FormState = {
  name: string;
  phone: string;
  email: string;
  kind: ClientKind;
  companyName: string;
  city: string;
  source: ClientSource;
  notes: string;
};

function initialForm(editing: VendorClient | null): FormState {
  return {
    name: editing?.name || '',
    phone: editing?.phone || '',
    email: editing?.email || '',
    kind: editing?.kind || 'person',
    companyName: editing?.companyName || '',
    city: editing?.city || '',
    source: editing?.source || 'whatsapp',
    notes: editing?.notes || '',
  };
}

const CITY_LIST_ID = 'client-city-options';

/** Add or edit a client from outside the platform. */
export function ClientFormModal({
  open,
  editing,
  existing,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: VendorClient | null;
  /** The saved clients, to catch the same phone typed twice. */
  existing: VendorClient[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: ClientDraft) => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(editing));
  const [error, setError] = useState('');

  const closeRef = useRef({ onClose, busy });
  closeRef.current = { onClose, busy };
  const close = useCallback(() => {
    if (!closeRef.current.busy) closeRef.current.onClose();
  }, []);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(editing));
    setError('');
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    if (!name) return setError('اكتب اسم العميل.');
    if (!phone && !email) return setError('اكتب جوال العميل أو بريده عشان تقدر تتواصل معه.');
    if (phone && phone.replace(/\D/g, '').length < 9) return setError('رقم الجوال ناقص. مثال: 0551234567');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('البريد الإلكتروني غير صحيح.');
    const twin = phone ? clientWithPhone(existing, phone, editing?.id) : undefined;
    if (twin) return setError(`هذا الجوال مسجّل من قبل باسم «${twin.name}».`);
    setError('');
    onSubmit({
      name,
      phone,
      email,
      kind: form.kind,
      companyName: form.kind === 'company' ? form.companyName.trim() || undefined : undefined,
      city: form.city.trim(),
      source: form.source,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={editing ? `تعديل بيانات ${editing.name}` : 'إضافة عميل'}
      description="عميل تعاملت معه خارج يوصل. البيانات تظهر لك أنت فقط."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم العميل *">
            <Input value={form.name} maxLength={120} autoComplete="off" onChange={(event) => set('name', event.target.value)} />
          </Field>
          <Field label="النوع">
            <Select value={form.kind} onChange={(event) => set('kind', event.target.value as ClientKind)}>
              {CLIENT_KINDS.map((key) => (
                <option key={key} value={key}>
                  {CLIENT_KIND_LABEL[key]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {form.kind === 'company' ? (
          <Field label="اسم الشركة / الجهة">
            <Input value={form.companyName} maxLength={120} onChange={(event) => set('companyName', event.target.value)} />
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="الجوال" hint="للتواصل عبر واتساب أو الاتصال">
            <Input
              type="tel"
              inputMode="tel"
              dir="ltr"
              className="text-end"
              placeholder="05xxxxxxxx"
              value={form.phone}
              maxLength={20}
              onChange={(event) => set('phone', event.target.value)}
            />
          </Field>
          <Field label="البريد الإلكتروني (اختياري)">
            <Input
              type="email"
              inputMode="email"
              dir="ltr"
              className="text-end"
              value={form.email}
              maxLength={160}
              onChange={(event) => set('email', event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المدينة">
            <Input list={CITY_LIST_ID} value={form.city} maxLength={80} onChange={(event) => set('city', event.target.value)} />
            <datalist id={CITY_LIST_ID}>
              {PLACE_NAMES.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="وصلك العميل عن طريق">
            <Select value={form.source} onChange={(event) => set('source', event.target.value as ClientSource)}>
              {CLIENT_SOURCES.map((key) => (
                <option key={key} value={key}>
                  {CLIENT_SOURCE_LABEL[key]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="ملاحظات (اختياري)" hint="مثل: يفضّل التواصل مساءً، مناسباته السنوية، طلباته السابقة.">
          <Textarea rows={3} maxLength={800} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
        </Field>

        {error ? <p className="text-[13px] text-[var(--critical)]">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={close} disabled={busy}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit" busy={busy}>
            {editing ? 'حفظ التعديل' : 'إضافة العميل'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
