export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return "Unknown";
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatDateTime(value?: string): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function shortPath(value: string): string {
  return value.replace(/^\/Users\/[^/]+/, "~");
}

export function money(value?: number): string {
  if (value === undefined) return "Not priced";
  if (value > 0 && value < 0.01) return "<$0.01 USD";
  return `${currency(value, 2, 2)} USD`;
}

export function moneyExact(value?: number): string {
  return value === undefined ? "Not priced" : `${currency(value, 2, 6)} USD`;
}

export function tokens(value: number): string {
  return `${compactNumber(value)} ${pluralize("token", value)}`;
}

export function tokensExact(value: number): string {
  return `${new Intl.NumberFormat().format(value)} ${pluralize("token", value)}`;
}

export function tokensCompact(value: number): string {
  return compactNumber(value);
}

export function count(value: number, noun: string): string {
  return `${compactNumber(value)} ${pluralize(noun, value)}`;
}

export function countExact(value: number, noun: string): string {
  return `${new Intl.NumberFormat().format(value)} ${pluralize(noun, value)}`;
}

export function percent(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value * 100)}%`;
}

export function percentExact(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value * 100)}%`;
}

export function currencyCompact(value: unknown): string {
  return typeof value === "number" ? currency(value, 0, 1, true) : "Unknown";
}

export function formatRate(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 2 }).format(value);
}

export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const units = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];
  const unit = units.find((item) => absolute >= item.threshold);
  if (!unit) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
  const scaled = absolute / unit.threshold;
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(scaled);
  return `${sign}${formatted}${unit.suffix}`;
}

function currency(value: number, minimumFractionDigits: number, maximumFractionDigits: number, compact = false): string {
  if (compact) return `$${compactNumber(value)}`;
  return `$${new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value)}`;
}

function pluralize(noun: string, value: number): string {
  if (value === 1) return noun;
  if (noun.endsWith("s")) return noun;
  if (noun.endsWith("y") && !/[aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}
