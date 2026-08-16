import { ArrowDownLeft, ArrowUpRight, LockKeyhole, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '../utils/formatters';

export function TypeBadge({ type }) {
  const income = type === 'Pemasukan';
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${income ? 'text-green-600' : 'text-amber-500'}`}>{income ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{income ? 'Kredit' : 'Debit'}</span>;
}

export function TransactionCard({ transaction }) {
  return <Link to={`/transactions/${transaction.id}`} className="block border-b border-stone-200 px-4 py-4 transition last:border-0 hover:bg-orange-50/50">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><TypeBadge type={transaction.type} /><h3 className="mt-1 truncate text-sm font-bold text-stone-900">{transaction.description || transaction.category}</h3><div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-stone-600"><span>{formatDate(transaction.timestamp)}</span><span>•</span><span>{transaction.category}</span><span>•</span><span>{transaction.scope === 'personal' ? 'Pos Pribadi' : 'Pos Bersama'}</span>{transaction.isLocked && <LockKeyhole size={11} />}</div></div>
      <div className="shrink-0 text-right"><div className="font-['Plus_Jakarta_Sans'] text-sm font-bold text-stone-900">{formatCurrency(transaction.amount)}</div><MoreHorizontal className="ml-auto mt-2 text-stone-400" size={16} /></div>
    </div>
  </Link>;
}
