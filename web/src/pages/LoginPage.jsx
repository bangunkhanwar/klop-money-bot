import { useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ whatsappNumber: '', code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await login(form.whatsappNumber, form.code); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <main className="grid min-h-screen bg-[#FCF9F6] lg:grid-cols-2">
    <section className="hidden bg-[#3A2418] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <Logo />
      <div className="max-w-lg"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#FFB957]">Pribadi • Bersama • Bisnis</p><h1 className="mt-5 font-['Plus_Jakarta_Sans'] text-5xl font-bold leading-[1.12]">Uang lebih tertata saat semuanya terasa klop.</h1><p className="mt-5 max-w-md text-base leading-7 text-orange-100/80">Catat lewat WhatsApp, pantau lewat dashboard, dan ambil keputusan bersama dengan data yang lebih jelas.</p></div>
      <div className="flex gap-8 text-sm text-orange-100"><span className="flex items-center gap-2"><CheckCircle2 size={18} />Data privat</span><span className="flex items-center gap-2"><CheckCircle2 size={18} />Login sekali pakai</span></div>
    </section>
    <section className="flex items-center justify-center px-5 py-10 md:px-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-10 lg:hidden"><Logo /></div>
        <div className="card p-5 md:p-8"><div className="grid size-12 place-items-center rounded-2xl bg-orange-50 text-[#E86B32]"><LockKeyhole /></div><h2 className="mt-5 font-['Plus_Jakarta_Sans'] text-2xl font-bold text-stone-900">Masuk ke Klop Money</h2><p className="mt-2 text-sm leading-6 text-stone-600">Kirim pesan <strong>login web</strong> ke chatbot Klop Money. Anda akan menerima kode 6 digit yang berlaku 5 menit.</p>
          <form className="mt-7 space-y-5" onSubmit={submit}>
            <label><span className="label">Nomor WhatsApp</span><input className="input" inputMode="tel" autoComplete="tel" placeholder="Contoh: 628123456789" value={form.whatsappNumber} onChange={(event) => setForm({ ...form, whatsappNumber: event.target.value.replace(/[^0-9]/g, '') })} required /></label>
            <label><span className="label">Kode login</span><input className="input text-center font-['Plus_Jakarta_Sans'] text-xl font-bold tracking-[.35em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.replace(/\D/g, '') })} required /></label>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
            <button className="btn-primary w-full" disabled={busy || form.code.length !== 6}>{busy ? 'Memeriksa...' : <>Masuk <ArrowRight size={18} /></>}</button>
          </form>
          <div className="mt-6 flex items-start gap-3 rounded-xl bg-[#FEF4E2] p-3.5 text-xs leading-5 text-stone-700"><MessageCircle className="mt-0.5 shrink-0 text-[#E86B32]" size={18} /><span>Kode hanya dikirim melalui percakapan WhatsApp Anda. Jangan pernah membagikannya.</span></div>
        </div>
      </div>
    </section>
  </main>;
}
