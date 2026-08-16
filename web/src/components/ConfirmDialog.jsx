import { AlertTriangle, X } from 'lucide-react';
import useModalScrollLock from '../hooks/useModalScrollLock';

export default function ConfirmDialog({ open, title, description, confirmLabel = 'Hapus', busy, onCancel, onConfirm }) {
  useModalScrollLock(open);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center overscroll-contain bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl animate-fade-up">
      <div className="flex items-start justify-between gap-4"><div className="grid size-11 place-items-center rounded-full bg-red-50 text-red-700"><AlertTriangle /></div><button className="btn-ghost min-h-9 p-2" onClick={onCancel} aria-label="Tutup"><X size={20} /></button></div>
      <h2 id="confirm-title" className="mt-4 font-['Plus_Jakarta_Sans'] text-xl font-bold text-stone-900">{title}</h2><p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
      <div className="mt-6 flex justify-end gap-3"><button className="btn-secondary" onClick={onCancel} disabled={busy}>Batal</button><button className="btn-primary !bg-red-700 hover:!bg-red-800" onClick={onConfirm} disabled={busy}>{busy ? 'Memproses...' : confirmLabel}</button></div>
    </div>
  </div>;
}
