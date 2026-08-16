import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';

export function LoadingScreen({ label = 'Memuat data...' }) {
  return <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-stone-500"><LoaderCircle className="animate-spin text-[#E86B32]" size={28} /><span className="text-sm">{label}</span></div>;
}

export function ErrorState({ message, onRetry }) {
  return <div className="card flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center"><AlertCircle className="text-red-700" /><p className="max-w-md text-sm text-stone-600">{message || 'Data gagal dimuat.'}</p>{onRetry && <button className="btn-secondary" onClick={onRetry}>Coba lagi</button>}</div>;
}

export function EmptyState({ title = 'Belum ada data', description, action }) {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-5 py-8 text-center"><div className="grid size-12 place-items-center rounded-full bg-orange-50 text-[#E86B32]"><Inbox /></div><h3 className="mt-2 font-semibold text-stone-900">{title}</h3>{description && <p className="max-w-sm text-xs leading-5 text-stone-500">{description}</p>}{action}</div>;
}
