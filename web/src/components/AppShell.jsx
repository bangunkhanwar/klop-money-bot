import { useEffect, useState } from 'react';
import { Bell, CircleHelp, Goal, Home, LogOut, Menu, Plus, Search, Settings, UserRound, WalletCards, WifiOff, X } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { currentMonth } from '../utils/formatters';
import Logo from './Logo';
import SuccessDialog from './SuccessDialog';

const navItems = [
  { to: '/', label: 'Beranda', icon: Home, end: true },
  { to: '/transactions', label: 'Transaksi', icon: WalletCards },
  { to: '/budget', label: 'Goals', icon: Goal },
  { to: '/account', label: 'Akun', mobileLabel: 'Saya', icon: UserRound }
];

function InstallButton() {
  const [prompt, setPrompt] = useState(null);
  useEffect(() => { const handler = (event) => { event.preventDefault(); setPrompt(event); }; window.addEventListener('beforeinstallprompt', handler); return () => window.removeEventListener('beforeinstallprompt', handler); }, []);
  if (!prompt) return null;
  return <button className="btn-secondary hidden md:inline-flex" onClick={async () => { await prompt.prompt(); setPrompt(null); }}>Install App</button>;
}

export default function AppShell() {
  const { user, logout, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [globalSearch, setGlobalSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(null);
  const [notificationError, setNotificationError] = useState('');
  const [success, setSuccess] = useState(null);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  useEffect(() => { const show = (event) => setSuccess(event.detail); window.addEventListener('klop:success', show); return () => window.removeEventListener('klop:success', show); }, []);

  function submitSearch(event) {
    event.preventDefault();
    const query = globalSearch.trim();
    navigate(query ? `/transactions?q=${encodeURIComponent(query)}` : '/transactions');
  }

  async function toggleNotifications() {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (!opening || notifications) return;
    setNotificationError('');
    if (user?.remindersEnabled === false) {
      setNotifications([{ title: 'Pengingat dinonaktifkan', detail: 'Aktifkan kembali melalui Settings jika ingin menerima peringatan budget.' }]);
      return;
    }
    try {
      const dashboard = await api.getDashboard(currentMonth());
      const items = dashboard.budgets.filter((budget) => budget.percentage > 100).map((budget) => ({ title: `${budget.category} melebihi budget`, detail: `Penggunaan mencapai ${budget.percentage}% bulan ini.` }));
      if (!dashboard.summary.transactionCount) items.push({ title: 'Belum ada transaksi', detail: 'Catat transaksi pertama bulan ini melalui web atau WhatsApp.' });
      setNotifications(items);
    } catch (requestError) {
      setNotificationError(requestError.message);
    }
  }

  return <div className="min-h-screen bg-[#FCF9F6]">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-stone-300 bg-orange-50 px-4 py-6 lg:flex">
      <div className="px-3"><Logo /></div>
      <nav className="mt-8 flex flex-1 flex-col gap-1">{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex items-center gap-4 rounded-lg px-4 py-3 text-xs transition ${isActive ? 'bg-[#E86B32] font-bold text-white' : 'text-[#2A1800] hover:bg-orange-100'}`}><Icon size={20} />{label}</NavLink>)}</nav>
      <div className="space-y-1 border-t border-stone-200 pt-3"><Link to="/help" className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-xs text-stone-700 hover:bg-orange-100"><CircleHelp size={19} />Pusat Bantuan</Link><Link to="/account/preferences" className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-xs text-stone-700 hover:bg-orange-100"><Settings size={19} />Settings</Link><button onClick={logout} className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-xs text-red-600 hover:bg-red-50"><LogOut size={19} />Keluar</button></div>
    </aside>

    <div className="lg:pl-60">
      <header className="safe-top sticky top-0 z-30 flex h-16 items-center justify-between border-b border-stone-200 bg-[#FCF9F6]/95 px-4 backdrop-blur md:px-8">
        <div className="lg:hidden"><Logo compact /></div>
        <form className="relative hidden w-full max-w-xs lg:block" onSubmit={submitSearch}><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" size={17} /><input className="input !min-h-10 !rounded-full !bg-stone-100 pl-10" placeholder="Cari transaksi..." value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} /></form>
        <div className="ml-auto flex items-center gap-3 md:gap-5">{!online && <span className="flex items-center gap-1 text-[10px] font-bold text-red-700"><WifiOff size={14} />Offline</span>}{isDemoMode && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">MODE DEMO</span>}<InstallButton /><button className="relative text-stone-700" onClick={toggleNotifications} aria-label="Notifikasi" aria-expanded={notificationsOpen}><Bell size={20} />{(notifications?.length || notifications === null) && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#E86B32]" />}</button><div className="hidden text-right sm:block"><div className="text-xs font-bold text-stone-900">{user?.workspaceName || user?.displayName}</div><div className="text-[10px] text-stone-500">{user?.displayName}</div></div><div className="grid size-9 place-items-center overflow-hidden rounded-full bg-[#FFDDB5] text-sm font-bold text-[#584239]">{user?.avatarDataUrl ? <img src={user.avatarDataUrl} alt="Foto profil" className="size-full object-cover" /> : user?.displayName?.charAt(0)?.toUpperCase() || 'K'}</div><button className="btn-ghost !min-h-9 px-2 lg:hidden" onClick={() => setMobileMenu(true)} aria-label="Buka menu"><Menu size={21} /></button></div>
        {notificationsOpen && <div className="absolute right-4 top-14 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl md:right-8"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">Notifikasi</h2><button className="btn-ghost min-h-8 p-1" onClick={() => setNotificationsOpen(false)} aria-label="Tutup notifikasi"><X size={17} /></button></div>{notificationError ? <p className="mt-3 text-xs text-red-700">{notificationError}</p> : notifications === null ? <p className="mt-3 text-xs text-stone-500">Memuat...</p> : notifications.length ? <div className="mt-3 space-y-2">{notifications.map((item) => <div key={item.title} className="rounded-xl bg-orange-50 p-3"><p className="text-xs font-bold text-stone-900">{item.title}</p><p className="mt-1 text-[10px] leading-4 text-stone-600">{item.detail}</p></div>)}</div> : <p className="mt-3 rounded-xl bg-green-50 p-3 text-xs text-green-700">Tidak ada peringatan budget bulan ini.</p>}</div>}
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 py-5 pb-28 md:px-8 md:py-8 lg:pb-10"><Outlet /></main>
    </div>

    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-stone-200 bg-white px-2 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,.05)] lg:hidden">
      {navItems.slice(0, 2).map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 text-[10px] ${isActive ? 'font-bold text-[#E86B32]' : 'text-stone-600'}`}><Icon size={21} />{label}</NavLink>)}
      <Link to="/transactions/new" className="-mt-7 flex flex-col items-center gap-1 text-[8px] font-bold leading-2 text-white"><span className="grid size-14 place-items-center rounded-full border-4 border-white bg-[#E86B32] shadow-lg"><Plus size={26} /></span><span className="text-[#E86B32]">Tambah</span></Link>
      {navItems.slice(2).map(({ to, label, mobileLabel, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-0.5 text-[10px] ${isActive ? 'font-bold text-[#E86B32]' : 'text-stone-600'}`}><Icon size={21} />{mobileLabel || label}</NavLink>)}
    </nav>

    {mobileMenu && <div className="fixed inset-0 z-[80] bg-black/35 lg:hidden" onClick={() => setMobileMenu(false)}><div className="ml-auto h-full w-72 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><Logo /><button className="btn-ghost" onClick={() => setMobileMenu(false)}><X /></button></div><div className="mt-8 space-y-2"><Link to="/help" onClick={() => setMobileMenu(false)} className="flex w-full items-center gap-3 rounded-lg p-3 text-sm text-stone-700"><CircleHelp size={20} />Pusat Bantuan</Link><Link to="/account/preferences" onClick={() => setMobileMenu(false)} className="flex w-full items-center gap-3 rounded-lg p-3 text-sm text-stone-700"><Settings size={20} />Settings</Link><button onClick={logout} className="flex w-full items-center gap-3 rounded-lg p-3 text-sm text-red-700"><LogOut size={20} />Keluar</button></div></div></div>}
    <SuccessDialog open={Boolean(success)} title={success?.title} message={success?.message} onClose={() => setSuccess(null)} />
  </div>;
}
