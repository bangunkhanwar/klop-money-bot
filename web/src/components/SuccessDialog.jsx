import { useEffect, useRef } from 'react';
import { Check, CheckCircle2, X } from 'lucide-react';
import useModalScrollLock from '../hooks/useModalScrollLock';

export default function SuccessDialog({ open, title, message, onClose }) {
  const buttonRef = useRef(null);
  useModalScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    buttonRef.current?.focus();
    const closeWithEscape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [open, onClose]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[120] grid place-items-center overscroll-contain bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="success-dialog-title">
    <div className="w-full max-w-sm rounded-3xl border border-orange-100 bg-[#FCF9F6] p-5 shadow-2xl animate-fade-up">
      <div className="flex items-start justify-between"><div className="grid size-14 place-items-center rounded-full bg-[#3C6451] text-white shadow-[0_6px_18px_rgba(60,100,81,.25)]"><CheckCircle2 size={29} /></div><button className="btn-ghost min-h-9 p-2" onClick={onClose} aria-label="Tutup"><X size={19} /></button></div>
      <h2 id="success-dialog-title" className="mt-5 font-['Plus_Jakarta_Sans'] text-xl font-bold text-stone-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">{message}</p>
      <button ref={buttonRef} className="btn-primary mt-6 w-full" onClick={onClose}><Check size={18} />Baik, Mengerti</button>
    </div>
  </div>;
}
