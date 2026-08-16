import { WalletCards } from 'lucide-react';

export default function Logo({ compact = false }) {
  return <div className="flex items-center gap-3">
    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E86B32] text-white shadow-sm"><WalletCards size={22} strokeWidth={2.2} /></div>
    {!compact && <div><div className="font-['Plus_Jakarta_Sans'] text-lg font-semibold leading-6 text-zinc-900">Klop Money</div><div className="text-[11px] font-bold text-zinc-500">Keuangan jadi klop</div></div>}
  </div>;
}
