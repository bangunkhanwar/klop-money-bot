export function formatCurrency(value, compact = false) {
  const amount = Number(value) || 0;
  if (compact && Math.abs(amount) >= 1_000_000) return `Rp${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}jt`;
  if (compact && Math.abs(amount) >= 1_000) return `Rp${Math.round(amount / 1_000).toLocaleString('id-ID')}rb`;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount).replace(/\s/g, '');
}

export function formatDate(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', ...options }).format(date);
}

export function formatDateTime(value) {
  return formatDate(value, { hour: '2-digit', minute: '2-digit' });
}

export function monthLabel(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || '');
  if (!match) return '';
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
