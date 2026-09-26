import { useMemo, useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import { placeKindLabel, searchPlaces } from '../../data/saudiPlaces.ts';

/**
 * Cities are validated against the shared Saudi place list on the server —
 * `validateVendorListing` silently drops anything `isSaudiPlaceName` rejects and
 * falls back to الرياض, so a free-text field would quietly publish the wrong
 * coverage. Picking from the list is the only way to know what was saved.
 */
export function CityPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    if (query.trim().length < 2) return [];
    return searchPlaces(query, 8).filter((place) => !value.includes(place.name));
  }, [query, value]);

  function add(name: string) {
    if (!value.includes(name)) onChange([...value, name]);
    setQuery('');
  }

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-secondary">مدن التغطية</span>

      {value.length ? (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((city) => (
            <li key={city}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-sunken px-2 py-1 text-xs text-ink">
                <MapPin size={12} className="text-ink-muted" aria-hidden />
                {city}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((item) => item !== city))}
                  aria-label={`إزالة ${city}`}
                  className="text-ink-muted transition-colors hover:text-[var(--critical)]"
                >
                  <X size={12} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن مدينة أو محافظة أو قرية…"
          aria-label="ابحث عن مدينة"
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-muted transition-colors hover:border-[var(--axis)] focus:border-accent focus:outline-none"
        />

        {matches.length ? (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-[var(--shadow-pop)]">
            {matches.map((place) => (
              <li key={`${place.region}-${place.name}`}>
                <button
                  type="button"
                  onClick={() => add(place.name)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-ink transition-colors hover:bg-sunken"
                >
                  <Plus size={13} className="shrink-0 text-ink-muted" aria-hidden />
                  <span className="flex-1 truncate">{place.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-muted">
                    {placeKindLabel(place.kind)} · {place.region}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="mt-1.5 text-xs text-ink-muted">
        بدون اختيار، يُنشر المنتج على الرياض فقط.
      </p>
    </div>
  );
}
