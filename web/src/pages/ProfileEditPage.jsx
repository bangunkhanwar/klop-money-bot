import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Save, Trash2, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import AvatarEditor from '../components/AvatarEditor';
import { notifySuccess } from '../utils/success';

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ProfileEditPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { setUser } = useAuth();
  const [form, setForm] = useState({ displayName: '', email: '', birthDate: '', city: '', phone: '', avatarDataUrl: '' });
  const [editorSource, setEditorSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAccount().then(({ profile }) => setForm({
      displayName: profile.displayName || '', email: profile.email || '', birthDate: profile.birthDate || '',
      city: profile.city || '', phone: profile.phone || '', avatarDataUrl: profile.avatarDataUrl || ''
    })).catch((requestError) => setError(requestError.message));
  }, []);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Gunakan foto JPG, PNG, atau WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Ukuran foto maksimal 10 MB.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => setEditorSource(String(reader.result || ''));
    reader.onerror = () => setError('Foto gagal dibaca dari perangkat.');
    reader.readAsDataURL(file);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const editableProfile = { ...form };
      delete editableProfile.phone;
      const { profile } = await api.updateAccount(editableProfile);
      setUser(profile);
      notifySuccess('Profil Berhasil Diperbarui', 'Informasi dan foto profil terbaru sudah diterapkan di seluruh aplikasi.');
      navigate('/account', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-2xl animate-fade-up">
    <div className="mb-5 flex items-center gap-3"><Link className="btn-ghost p-2" to="/account"><ArrowLeft size={20} /></Link><div><h1 className="page-title">Ubah Profil</h1><p className="mt-1 text-xs text-stone-600">Perbarui informasi yang tampil di Klop Money.</p></div></div>
    <form className="card p-5 md:p-7" onSubmit={submit}>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-[#FFDDB5] text-[#584239]">
          {form.avatarDataUrl ? <img src={form.avatarDataUrl} alt="Foto profil" className="size-full object-cover" /> : <UserRound size={38} />}
        </div>
        <div className="flex-1"><p className="text-sm font-bold">Foto profil</p><p className="mt-1 text-xs leading-5 text-stone-500">JPG, PNG, atau WebP maksimal 10 MB. Foto akan dipotong dan dikompresi sebelum disimpan.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}><Camera size={17} />{form.avatarDataUrl ? 'Ganti foto' : 'Pilih foto'}</button>{form.avatarDataUrl && <button type="button" className="btn-ghost text-red-700" onClick={() => update('avatarDataUrl', '')}><Trash2 size={16} />Hapus</button>}</div><input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} /></div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="label">Nama Lengkap / Alias</span><input className="input" maxLength={80} value={form.displayName} onChange={(event) => update('displayName', event.target.value)} required /></label>
        <label><span className="label">Email (Opsional)</span><input className="input" type="email" maxLength={120} value={form.email} onChange={(event) => update('email', event.target.value)} /></label>
        <label><span className="label">Nomor WhatsApp</span><input className="input cursor-not-allowed bg-stone-100" value={`•••• ${form.phone.slice(-4)}`} disabled /><span className="mt-1.5 block text-[10px] leading-4 text-stone-500">Identitas akun dikunci. Perubahan hanya dapat diproses oleh owner/admin atau developer.</span></label>
        <label><span className="label">Tanggal Lahir (Opsional)</span><input className="input" type="date" value={form.birthDate} onChange={(event) => update('birthDate', event.target.value)} /></label>
        <label><span className="label">Kota (Opsional)</span><input className="input" maxLength={80} value={form.city} onChange={(event) => update('city', event.target.value)} /></label>
      </div>
      {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <div className="mt-7 flex flex-col-reverse gap-3 border-t border-stone-200 pt-5 sm:flex-row sm:justify-end"><Link className="btn-secondary" to="/account">Batal</Link><button className="btn-primary" disabled={busy}><Save size={17} />{busy ? 'Menyimpan...' : 'Simpan Perubahan'}</button></div>
    </form>
    {editorSource && <AvatarEditor source={editorSource} onCancel={() => setEditorSource('')} onApply={(avatarDataUrl) => { update('avatarDataUrl', avatarDataUrl); setEditorSource(''); }} />}
  </div>;
}
