// Date-range presets for filtered exports. Returns { from, to } as YYYY-MM-DD,
// or null parts for an open range. Indian Financial Year = Apr 1 → Mar 31.
const iso = (d) => d.toISOString().slice(0, 10);

export function indianFY(offset = 0) {
  const now = new Date();
  // FY starting year: if month >= April (3, 0-indexed), it's this year, else last year.
  const startYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) + offset;
  return {
    label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

export function presetRange(preset) {
  const now = new Date();
  switch (preset) {
    case 'last6m': {
      const f = new Date(now); f.setMonth(f.getMonth() - 6);
      return { from: iso(f), to: iso(now) };
    }
    case 'last12m': {
      const f = new Date(now); f.setMonth(f.getMonth() - 12);
      return { from: iso(f), to: iso(now) };
    }
    case 'fy_current': { const fy = indianFY(0); return { from: fy.from, to: fy.to }; }
    case 'fy_prev': { const fy = indianFY(-1); return { from: fy.from, to: fy.to }; }
    case 'fy_2': { const a = indianFY(-1); const b = indianFY(0); return { from: a.from, to: b.to }; }
    default: return { from: '', to: '' };
  }
}

export const PRESETS = [
  { value: '', label: 'All dates' },
  { value: 'last6m', label: 'Last 6 months' },
  { value: 'last12m', label: 'Last 12 months' },
  { value: 'fy_current', label: indianFY(0).label + ' (current FY)' },
  { value: 'fy_prev', label: indianFY(-1).label + ' (last FY)' },
  { value: 'fy_2', label: 'Last 2 Financial Years' },
  { value: 'custom', label: 'Custom range' },
];
