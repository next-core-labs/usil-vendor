import { useEffect, useState, type FormEvent } from 'react';
import { Info, Send } from 'lucide-react';
import { errorText } from '../../api/client.ts';
import { looksLikeSaudiIban, normalizeIban, payouts, type PayoutRequest } from '../../api/payouts.ts';
import { Button, Card, CardHeader, Field, Input, Select, Textarea } from '../ui/primitives.tsx';
import { ConfirmDialog } from '../ui/Modal.tsx';
import { SAUDI_BANKS } from '../../lib/labels.ts';
import { useToast } from '../../state/ToastContext.tsx';
import { groupIban, money } from './labels.ts';

export type BankPrefill = { iban: string; accountHolder: string; bankName: string };

type Draft = { amount: string; iban: string; accountHolder: string; bankName: string; note: string };

/**
 * Asks إدارة يوصل to transfer part of the available balance. The server checks
 * the amount against its own balance; the checks here only save a round trip.
 */
export function PayoutForm({
  available,
  openRequest,
  prefill,
  onSent,
}: {
  available: number;
  /** A request still awaiting the admin — a new one is refused until it is decided. */
  openRequest: PayoutRequest | null;
  prefill: BankPrefill | null;
  onSent: (row: PayoutRequest) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({ amount: '', iban: '', accountHolder: '', bankName: '', note: '' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The bank details saved in «الهوية والفواتير» arrive after the first render.
  useEffect(() => {
    if (!prefill) return;
    setDraft((current) => ({
      ...current,
      iban: current.iban || prefill.iban || '',
      accountHolder: current.accountHolder || prefill.accountHolder || '',
      bankName: current.bankName || prefill.bankName || '',
    }));
  }, [prefill]);

  const set = (key: keyof Draft, value: string) => {
    setError('');
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const amount = Math.round(Number(draft.amount) * 100) / 100;
  const blocked = Boolean(openRequest) || available <= 0;
  const banks: string[] = draft.bankName && !(SAUDI_BANKS as readonly string[]).includes(draft.bankName)
    ? [draft.bankName, ...SAUDI_BANKS]
    : [...SAUDI_BANKS];

  const check = (): string => {
    if (!Number.isFinite(amount) || amount <= 0) return 'اكتب مبلغاً أكبر من صفر.';
    if (Math.round(amount * 100) > Math.round(available * 100)) return `المبلغ أكبر من المتاح للسحب (${money(available)}).`;
    if (!looksLikeSaudiIban(draft.iban)) return 'رقم الآيبان يبدأ بـ SA ويتبعه 22 رقماً.';
    if (!draft.accountHolder.trim()) return 'اكتب اسم صاحب الحساب كما هو في البنك.';
    if (!draft.bankName.trim()) return 'اختر البنك.';
    return '';
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = check();
    if (problem) {
      setError(problem);
      return;
    }
    setConfirming(true);
  };

  const send = async () => {
    setBusy(true);
    try {
      const row = await payouts.request({
        amount,
        iban: normalizeIban(draft.iban),
        accountHolder: draft.accountHolder.trim(),
        bankName: draft.bankName.trim(),
        note: draft.note.trim() || undefined,
      });
      toast.success(`أرسلنا طلب سحب ${money(row.amount)} إلى إدارة يوصل`);
      setDraft((current) => ({ ...current, amount: '', note: '' }));
      setConfirming(false);
      onSent(row);
    } catch (caught) {
      setConfirming(false);
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="طلب سحب"
        subtitle="يصل طلبك إلى إدارة يوصل، ويُحوَّل المبلغ إلى حسابك البنكي بعد مراجعة الإدارة."
      />
      {openRequest ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-sunken px-3 py-2.5 text-[13px] leading-6 text-ink-secondary">
          <Info size={15} className="mt-1 shrink-0" aria-hidden />
          عندك طلب سحب بمبلغ {money(openRequest.amount)} قيد مراجعة الإدارة. تقدر ترسل طلباً جديداً بعد قرارها.
        </p>
      ) : available <= 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-sunken px-3 py-2.5 text-[13px] leading-6 text-ink-secondary">
          <Info size={15} className="mt-1 shrink-0" aria-hidden />
          ما عندك رصيد متاح للسحب الآن. يصير مبلغ الطلب متاحاً بعد ما تسجّله «مكتمل».
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <fieldset disabled={blocked || busy} className="space-y-4 disabled:opacity-70">
          <Field label="المبلغ (ر.س)" hint={`المتاح للسحب: ${money(available)}`}>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                dir="ltr"
                className="tabular text-end"
                value={draft.amount}
                onChange={(event) => set('amount', event.target.value)}
                placeholder="0.00"
              />
              <Button size="md" variant="secondary" onClick={() => set('amount', available.toFixed(2))}>
                كامل الرصيد
              </Button>
            </div>
          </Field>
          <Field label="الآيبان" hint={draft.iban ? groupIban(normalizeIban(draft.iban)) : 'SA ثم 22 رقماً'}>
            <Input
              dir="ltr"
              className="tabular text-end uppercase"
              value={draft.iban}
              onChange={(event) => set('iban', event.target.value)}
              placeholder="SA0000000000000000000000"
              autoComplete="off"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم صاحب الحساب">
              <Input value={draft.accountHolder} onChange={(event) => set('accountHolder', event.target.value)} />
            </Field>
            <Field label="البنك">
              <Select value={draft.bankName} onChange={(event) => set('bankName', event.target.value)}>
                <option value="">اختر البنك</option>
                {banks.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="ملاحظة للإدارة (اختياري)">
            <Textarea rows={2} maxLength={500} value={draft.note} onChange={(event) => set('note', event.target.value)} />
          </Field>
        </fieldset>
        {error ? (
          <p role="alert" className="text-[13px] text-[var(--critical)]">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" icon={<Send size={15} />} disabled={blocked} busy={busy}>
            إرسال طلب السحب
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title="تأكيد طلب السحب"
        body={`بترسل طلب سحب ${money(amount)} إلى إدارة يوصل، على آيبان ${groupIban(normalizeIban(draft.iban))} باسم ${draft.accountHolder.trim()} (${draft.bankName}). يُحجز المبلغ من رصيدك المتاح، والتحويل بنكي بعد مراجعة الإدارة.`}
        confirmLabel="إرسال الطلب"
        busy={busy}
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
