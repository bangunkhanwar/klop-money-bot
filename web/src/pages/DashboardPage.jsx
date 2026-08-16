import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, CircleDollarSign, Plus, ReceiptText, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { currentMonth, formatCurrency, monthLabel } from '../utils/formatters';
import { ErrorState, LoadingScreen, EmptyState } from '../components/Feedback';
import { TransactionCard } from '../components/TransactionItem';

function SummaryCard({ tone = 'light', eyebrow, value, note, icon: Icon }) {
  const dark = tone === 'dark'; const orange = tone === 'orange';
  return <div className={`relative overflow-hidden rounded-2xl p-5 ${dark ? 'bg-[#3C6451] text-white' : orange ? 'bg-[#E86B32] text-white' : 'border border-stone-200 bg-white text-stone-900'}`}>
    <div className={`absolute right-4 top-4 grid size-10 place-items-center rounded-full ${dark || orange ? 'bg-white/15' : 'bg-orange-50 text-[#E86B32]'}`}><Icon size={20} /></div><p className={`eyebrow pr-10 ${dark || orange ? '!text-white/80' : ''}`}>{eyebrow}</p><p className="mt-3 font-['Plus_Jakarta_Sans'] text-xl font-bold md:text-2xl">{value}</p><p className={`mt-2 text-[11px] ${dark || orange ? 'text-white/80' : 'text-stone-500'}`}>{note}</p>
  </div>;
}

function BudgetCard({ budget }) {
  const over = budget.percentage > 100; const percentage = Math.min(budget.percentage, 100);
  return <div className="panel min-w-[240px] flex-1 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-[#2A1800]">{budget.category}</h3><p className={`mt-1 text-sm font-bold ${over ? 'text-red-700' : 'text-stone-900'}`}>{formatCurrency(budget.spent)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${over ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-[#A13A00]'}`}>{budget.percentage}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"><div className={`h-full rounded-full ${over ? 'bg-red-700' : 'bg-[#FCAB28]'}`} style={{ width: `${percentage}%` }} /></div><p className="mt-2 text-[11px] text-stone-600">Target: {formatCurrency(budget.amount)}</p><div className="mt-2 flex items-center justify-between text-xs font-semibold"><span className={over ? 'text-red-700' : 'text-stone-600'}>{over ? `Melebihi ${formatCurrency(budget.spent - budget.amount)}` : `Sisa ${formatCurrency(budget.amount - budget.spent)}`}</span><Link to="/budget" className="text-[#A13A00]">Sesuaikan</Link></div></div>;
}

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth()); const [data, setData] = useState(null); const [error, setError] = useState('');
  const load = useCallback(() => { api.getDashboard(month).then(setData).catch((requestError) => setError(requestError.message)); }, [month]);
  useEffect(load, [load]);
  if (!data && !error) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  const { summary, budgets, recentTransactions } = data;
  return <div className="space-y-7 animate-fade-up">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-[#E86B32]">Mobile Site</p><h1 className="page-title mt-1">Ringkasan Keuangan</h1><p className="mt-1 text-xs text-stone-600">Pantau arus uang dan budget dalam satu tempat.</p></div><label className="relative w-full sm:w-auto"><CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={17} /><input type="month" className="input pl-10 sm:w-48" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Pilih bulan" /></label></div>
    <section className="grid gap-3 md:grid-cols-3"><SummaryCard eyebrow="Pemasukan (bulan ini)" value={formatCurrency(summary.income)} note={`${monthLabel(month)} • uang masuk`} icon={TrendingUp} /><SummaryCard tone="dark" eyebrow="Pengeluaran (bulan ini)" value={formatCurrency(summary.expense)} note={`Rata-rata ${formatCurrency(summary.averageDailyExpense, true)}/hari`} icon={TrendingDown} /><SummaryCard tone="orange" eyebrow="Jumlah transaksi" value={String(summary.transactionCount)} note={`Saldo ${formatCurrency(summary.balance)}`} icon={ReceiptText} /></section>
    <section><div className="mb-4 flex items-end justify-between"><div><h2 className="section-title">Analisis Pengeluaran</h2><p className="mt-1 text-xs text-stone-600">Distribusi pengeluaran terhadap budget bulanan</p></div><Link to="/budget" className="hidden items-center gap-1 text-xs font-semibold text-[#A13A00] sm:flex">Lihat semua <ArrowRight size={14} /></Link></div><div className="scrollbar-none flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 xl:grid-cols-4">{budgets.slice().sort((a, b) => b.percentage - a.percentage).slice(0, 6).map((budget) => <BudgetCard key={budget.category} budget={budget} />)}</div><Link to="/budget" className="btn-secondary mt-3 w-full sm:hidden"><Plus size={16} />Tambah Penyesuaian Kategori</Link></section>
    <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-stone-200 px-4 py-4 md:px-6"><div><h2 className="section-title">Daftar Transaksi</h2><p className="mt-1 text-xs text-stone-600">{monthLabel(month)}</p></div><Link to="/transactions/new" className="btn-primary"><Plus size={17} /><span className="hidden sm:inline">Transaksi Baru</span><span className="sm:hidden">Baru</span></Link></div>{recentTransactions.length ? <div>{recentTransactions.map((transaction) => <TransactionCard key={transaction.id} transaction={transaction} />)}<Link to="/transactions" className="flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold text-[#A13A00]">Lihat Selengkapnya ({summary.transactionCount}) <ArrowRight size={16} /></Link></div> : <EmptyState title="Belum ada transaksi" description="Catat transaksi lewat WhatsApp atau tombol Transaksi Baru." action={<Link to="/transactions/new" className="btn-primary mt-3"><CircleDollarSign size={17} />Tambah transaksi</Link>} />}</section>
  </div>;
}
