// Platform-wide date formatting: dd/mm/yyyy everywhere.
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDate(isoDate: string | Date): string {
  const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTime(isoDate: string | Date): string {
  const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return `${formatDate(date)}, ${date.toLocaleTimeString()}`;
}
