export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = typeof payload?.error === "string" ? payload.error : `Request failed (${response.status})`;
    const details = payload?.details && typeof payload.details === "object" ? payload.details as Record<string, unknown> : null;
    const hint = details?.field === "versionName" && typeof details.manifest === "string" ? ` Use manifest version name: ${details.manifest}.` : details?.field === "versionCode" && typeof details.manifest === "number" ? ` Use manifest version code: ${details.manifest}.` : "";
    throw new Error(`${error}${hint}`);
  }
  return payload as T;
}

export function formatBytes(value: number | null | undefined) {
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
