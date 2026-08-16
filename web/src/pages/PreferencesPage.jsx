import { useEffect, useState } from 'react';
import { ArrowLeft, BellRing, Save } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { LoadingScreen } from '../components/Feedback';
import { notifySuccess } from '../utils/success';

export default function PreferencesPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getAccount().then(({ profile }) => setForm({ currency: profile.currency || 'IDR', reportPeriod: profile.reportPeriod || 'monthly', remindersEnabled: Boolean(profile.remindersEnabled) })).catch((requestError) => setError(requestError.message));
  }, []);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const { profile } = await api.updateAccount(form); setUser(profile); notifySuccess('Preferensi Berhasil Disimpan', 'Format laporan dan pengaturan pengingat sudah diperbarui.'); navigate('/account', { replace: true }); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  if (!form && !error) return <LoadingScreen />;
  return <div className="mx-auto max-w-2xl animate-fade-up"><div className="mb-5 flex items-center gap-3"><Link className="btn-ghost p-2" to="/account"><ArrowLeft size={20} /></Link><div><h1 className="page-title">Preferensi Keuangan</h1><p className="mt-1 text-xs text-stone-600">Atur format laporan dan pengingat workspace.</p></div></div>
    <form className="card space-y-6 p-5 md:p-7" onSubmit={submit}>
      <label><span className="label">Mata Uang</span><select className="input" value={form?.currency || 'IDR'} disabled><option value="IDR">IDR — Rupiah Indonesia (Rp)</option></select><span className="mt-1 block text-[10px] text-stone-500">Versi saat ini menggunakan Rupiah agar perhitungan tetap konsisten.</span></label>
      <fieldset><legend className="label">Format Laporan</legend><div className="grid grid-cols-2 gap-2"><button type="button" className={`rounded-xl border p-4 text-left ${form?.reportPeriod === 'weekly' ? 'border-[#E86B32] bg-orange-50' : 'border-stone-300'}`} onClick={() => setForm({ ...form, reportPeriod: 'weekly' })}><strong className="block text-sm">Mingguan</strong><span className="mt-1 block text-xs text-stone-500">Ringkasan per pekan</span></button><button type="button" className={`rounded-xl border p-4 text-left ${form?.reportPeriod === 'monthly' ? 'border-[#E86B32] bg-orange-50' : 'border-stone-300'}`} onClick={() => setForm({ ...form, reportPeriod: 'monthly' })}><strong className="block text-sm">Bulanan</strong><span className="mt-1 block text-xs text-stone-500">Ringkasan per bulan</span></button></div></fieldset>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 p-4"><div className="grid size-10 place-items-center rounded-lg bg-orange-50 text-[#E86B32]"><BellRing size={19} /></div><span className="flex-1"><strong className="block text-sm">Pengingat budget</strong><span className="mt-1 block text-xs text-stone-500">Tampilkan peringatan ketika budget terlampaui.</span></span><input type="checkbox" className="size-5 accent-[#E86B32]" checked={Boolean(form?.remindersEnabled)} onChange={(event) => setForm({ ...form, remindersEnabled: event.target.checked })} /></label>
      {error && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <div className="flex flex-col-reverse gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:justify-end"><Link className="btn-secondary" to="/account">Batal</Link><button className="btn-primary" disabled={busy}><Save size={17} />{busy ? 'Menyimpan...' : 'Simpan Preferensi'}</button></div>
    </form></div>;
}
