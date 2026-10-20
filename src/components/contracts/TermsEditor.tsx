import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button, Textarea } from '../ui/primitives.tsx';

/**
 * The contract's numbered terms: edit, add, remove and reorder. The numbering
 * the client sees follows this order.
 */
export function TermsEditor({
  terms,
  onChange,
  onRestore,
}: {
  terms: string[];
  onChange: (next: string[]) => void;
  onRestore?: () => void;
}) {
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= terms.length) return;
    const next = [...terms];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-secondary">بنود العقد ({terms.length})</span>
        <div className="flex gap-1">
          {onRestore ? (
            <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={onRestore}>
              البنود الافتراضية
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => onChange([...terms, ''])}>
            بند
          </Button>
        </div>
      </div>
      <ol className="space-y-2">
        {terms.map((term, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-center text-xs font-semibold tabular text-ink-muted">{index + 1}</span>
            <Textarea
              rows={2}
              aria-label={`البند ${index + 1}`}
              value={term}
              placeholder="نص البند"
              onChange={(event) => onChange(terms.map((item, i) => (i === index ? event.target.value : item)))}
              className="min-h-[64px] flex-1"
            />
            <div className="flex shrink-0 flex-col">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`رفع البند ${index + 1}`}
                icon={<ArrowUp size={14} />}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`إنزال البند ${index + 1}`}
                icon={<ArrowDown size={14} />}
                disabled={index === terms.length - 1}
                onClick={() => move(index, 1)}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`حذف البند ${index + 1}`}
                icon={<Trash2 size={14} />}
                disabled={terms.length < 2}
                onClick={() => onChange(terms.filter((_, i) => i !== index))}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
