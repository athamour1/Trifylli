/** Μορφοποίηση ημερομηνιών και ποσών στα ελληνικά. */

const LOCALE = 'el-GR';

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(LOCALE, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/** «Δευτέρα 7 Σεπτεμβρίου 2026» — για επικεφαλίδες και εκτυπώσεις. */
export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Εύρος ημερομηνιών· συμπτύσσει τη μονοήμερη σε μία ημερομηνία. */
export function formatDateRange(start: string | Date, end: string | Date): string {
  const from = typeof start === 'string' ? new Date(start) : start;
  const to = typeof end === 'string' ? new Date(end) : end;
  if (from.toDateString() === to.toDateString()) return formatDate(from);
  return `${formatDate(from)} – ${formatDate(to)}`;
}

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' }).format(value);
}

/** «1ώ 45΄» — πιο ευανάγνωστο από «105 λεπτά» σε timeline. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}΄`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}ώ` : `${hours}ώ ${rest}΄`;
}

/** ISO ημερομηνία (YYYY-MM-DD) για inputs τύπου date. */
export function toISODate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
