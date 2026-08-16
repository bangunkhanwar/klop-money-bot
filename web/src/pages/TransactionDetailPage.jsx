import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock, Edit3, LockKeyhole, Tag, Trash2, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { ErrorState, LoadingScreen } from '../components/Feedback';
import { TypeBadge } from '../components/TransactionItem';
import ConfirmDialog from '../components/ConfirmDialog';
import { notifySuccess } from '../utils/success';

function DetailRow({ icon: Icon, label, children }) {
  return <div className="flex items-start gap-3 border-b border-stone-200 py-4 last:border-0"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-orange-50 text-[#E86B32]"><Icon size={18} /></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{label}</p><div className="mt-1 text-sm font-semibold text-stone-900">{children}</div></div></div>;
}

export default function TransactionDetailPage() {
  const { id } = useParams(); const navigate = useNavigate(); const [transaction, setTransaction] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false);
  const load = useCallback(() => { api.getTransaction(id).then(({ transaction: item }) => setTransaction(item)).catch((requestError) => setError(requestError.message)); }, [id]);
  useEffect(load, [load]);
  async function toggleScope() { setBusy(true); try { const data = await api.updateTransaction(id, { scope: transaction.scope === 'personal' ? 'shared' : 'personal' }); setTransaction(data.transaction); notifySuccess('Pos Transaksi Berhasil Diubah', `Transaksi sekarang tersimpan sebagai ${data.transaction.scope === 'personal' ? 'Pos Pribadi' : 'Pos Bersama'}.`); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  async function remove() { setBusy(true); try { await api.deleteTransaction(id); setConfirmDelete(false); notifySuccess('Transaksi Berhasil Dihapus', 'Transaksi disembunyikan dari laporan aktif, sementara data audit tetap dipertahankan dengan aman.'); navigate('/transactions', { replace: true }); } catch (requestError) { setError(requestError.message); setConfirmDelete(false); setBusy(false); } }
  if (!transaction && !error) return <LoadingScreen />;
  if (error && !transaction) return <ErrorState message={error} onRetry={() => { setError(''); load(); }} />;
  return <div className="mx-auto max-w-4xl animate-fade-up"><div className="mb-5 flex items-center gap-3"><Link className="btn-ghost p-2" to="/transactions"><ArrowLeft size={20} /></Link><div><h1 className="page-title">Detail Transaksi</h1><p className="mt-1 text-xs text-stone-600">Informasi lengkap transaksi terpilih.</p></div></div>
    {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]"><section className="card overflow-hidden"><div className={`p-6 text-white ${transaction.type === 'Pemasukan' ? 'bg-[#3C6451]' : 'bg-[#E86B32]'}`}><div className="flex items-start justify-between gap-4"><div><TypeBadge type={transaction.type} /><p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-white/75">Total {transaction.type === 'Pemasukan' ? 'Kredit' : 'Debit'}</p><p className="mt-1 font-['Plus_Jakarta_Sans'] text-3xl font-bold">{formatCurrency(transaction.amount)}</p></div><span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">{transaction.scope === 'personal' ? <LockKeyhole size={14} /> : <UsersRound size={14} />}{transaction.scope === 'personal' ? 'Pos Pribadi' : 'Pos Bersama'}</span></div></div>
      <div className="px-5 py-2 md:px-6"><DetailRow icon={WalletCards} label="Tipe"><TypeBadge type={transaction.type} /></DetailRow><DetailRow icon={Tag} label="Kategori">{transaction.category}</DetailRow><DetailRow icon={CalendarClock} label="Tanggal & Waktu">{formatDateTime(transaction.timestamp)}</DetailRow><DetailRow icon={UserRound} label="Dibuat oleh">Pengguna {String(transaction.reporter).replace(/\D/g, '').slice(-4)}</DetailRow><DetailRow icon={Edit3} label="Keterangan">{transaction.description || '-'}</DetailRow></div></section>
      <aside className="card h-fit p-4"><h2 className="text-sm font-bold text-stone-900">Quick Actions</h2><div className="mt-3 space-y-2">{transaction.canEdit ? <><Link className="btn-primary w-full" to={`/transactions/${id}/edit`}><Edit3 size={17} />Edit Transaksi</Link><button className="btn-secondary w-full" onClick={toggleScope} disabled={busy}>{transaction.scope === 'personal' ? <UsersRound size={17} /> : <LockKeyhole size={17} />}Ubah Pos</button><button className="btn-ghost w-full !justify-start text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}><Trash2 size={17} />Hapus Transaksi</button></> : <div className="rounded-xl bg-stone-100 p-3 text-xs leading-5 text-stone-600"><LockKeyhole className="mb-2" size={18} />Detail transaksi pribadi milik anggota lain dikunci.</div>}</div></aside></div>
    <ConfirmDialog open={confirmDelete} title="Hapus Transaksi?" description="Transaksi akan disembunyikan dari aplikasi dan laporan aktif. Data audit tetap dipertahankan dengan status dihapus." busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
  </div>;
}
