import { currentMonth } from '../utils/formatters';

const STORAGE_KEY = 'klop-money-demo-v1';

function isoDay(day, hour = 10) {
  const [year, month] = currentMonth().split('-').map(Number);
  return new Date(year, month - 1, Math.min(day, new Date(year, month, 0).getDate()), hour).toISOString();
}

const defaultBudgets = [
  ['Lainnya', 300000], ['Tagihan', 900000], ['Kebutuhan Pokok', 1200000], ['Makanan & Minuman', 1500000],
  ['Hiburan', 400000], ['Pendidikan', 300000], ['Transportasi', 600000], ['Belanja', 450000], ['Kesehatan', 350000]
].map(([category, amount]) => ({ category, amount }));

function initialState() {
  return {
    profile: {
      phone: '628123456789', userId: 'demo-user', workspaceId: 'demo-workspace', displayName: 'Partner A',
      workspaceName: 'Partner A & Partner B', workspaceType: 'shared', email: 'partner.a@example.com',
      birthDate: '1990-10-12', city: 'Bandung', currency: 'IDR', reportPeriod: 'monthly', remindersEnabled: true,
      partner: { name: 'Partner B', phoneMasked: '•••• 6789' }
    },
    budgets: defaultBudgets,
    transactions: [
      { id: 'demo-1', timestamp: isoDay(28), type: 'Pemasukan', category: 'Gaji', amount: 4000000, description: 'Gaji bulan ini', reporter: '628123456789', workspaceId: 'demo-workspace', scope: 'personal', status: 'active', source: 'web' },
      { id: 'demo-2', timestamp: isoDay(26), type: 'Pemasukan', category: 'Bonus', amount: 2000000, description: 'Bonus proyek', reporter: '628987654321', workspaceId: 'demo-workspace', scope: 'shared', status: 'active', source: 'whatsapp' },
      { id: 'demo-3', timestamp: isoDay(24), type: 'Pengeluaran', category: 'Kebutuhan Pokok', amount: 1000000, description: 'Belanja mingguan sayur & buah', reporter: '628123456789', workspaceId: 'demo-workspace', scope: 'shared', status: 'active', source: 'web' },
      { id: 'demo-4', timestamp: isoDay(21), type: 'Pengeluaran', category: 'Tagihan', amount: 800000, description: 'Listrik dan internet', reporter: '628987654321', workspaceId: 'demo-workspace', scope: 'shared', status: 'active', source: 'whatsapp' },
      { id: 'demo-5', timestamp: isoDay(18), type: 'Pengeluaran', category: 'Makanan & Minuman', amount: 1200000, description: 'Makan siang bareng', reporter: '628123456789', workspaceId: 'demo-workspace', scope: 'shared', status: 'active', source: 'whatsapp' },
      { id: 'demo-6', timestamp: isoDay(14), type: 'Pengeluaran', category: 'Transportasi', amount: 350000, description: 'Bensin mobil', reporter: '628987654321', workspaceId: 'demo-workspace', scope: 'shared', status: 'active', source: 'whatsapp' },
      { id: 'demo-7', timestamp: isoDay(10), type: 'Pengeluaran', category: 'Belanja', amount: 750000, description: 'Keperluan rumah', reporter: '628123456789', workspaceId: 'demo-workspace', scope: 'personal', status: 'active', source: 'web' },
      { id: 'demo-8', timestamp: isoDay(7), type: 'Pengeluaran', category: 'Lainnya', amount: 500000, description: 'Keperluan lainnya', reporter: '628987654321', workspaceId: 'demo-workspace', scope: 'shared', status: 'active', source: 'whatsapp' }
    ]
  };
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || initialState(); } catch { return initialState(); }
}

function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

function visible(transaction, phone) {
  const own = transaction.reporter === phone;
  return { ...transaction, isLocked: transaction.scope === 'personal' && !own, canEdit: own,
    description: transaction.scope === 'personal' && !own ? 'Terkunci' : transaction.description,
    category: transaction.scope === 'personal' && !own ? 'Pribadi' : transaction.category };
}

function list(month) {
  const state = load();
  return state.transactions.filter((item) => item.status !== 'deleted' && (!month || item.timestamp.slice(0, 7) === month))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map((item) => visible(item, state.profile.phone));
}

function dashboard(month = currentMonth()) {
  const state = load(); const transactions = list(month);
  const income = transactions.filter((item) => item.type === 'Pemasukan').reduce((sum, item) => sum + item.amount, 0);
  const expense = transactions.filter((item) => item.type === 'Pengeluaran').reduce((sum, item) => sum + item.amount, 0);
  const budgets = state.budgets.map((budget) => { const spent = transactions.filter((item) => item.type === 'Pengeluaran' && item.category === budget.category).reduce((sum, item) => sum + item.amount, 0); return { ...budget, spent, percentage: Math.round((spent / budget.amount) * 1000) / 10 }; });
  const contributions = ['628123456789', '628987654321'].map((phone, index) => { const items = transactions.filter((item) => item.reporter === phone); return { reporter: phone, name: `Partner ${index ? 'B' : 'A'}`, count: items.length, income: items.filter((item) => item.type === 'Pemasukan').reduce((sum, item) => sum + item.amount, 0), expense: items.filter((item) => item.type === 'Pengeluaran').reduce((sum, item) => sum + item.amount, 0) }; });
  return { month, summary: { income, expense, balance: income - expense, transactionCount: transactions.length, averageDailyExpense: Math.round(expense / 30) }, budgets, contributions, recentTransactions: transactions.slice(0, 5) };
}

export const demoApi = {
  async verifyLogin() { return { user: load().profile }; },
  async getMe() { return { user: load().profile }; },
  async logout() { return { message: 'Berhasil keluar.' }; },
  async getDashboard(month) { return dashboard(month); },
  async getCategories() { return { categories: [...new Set([...defaultBudgets.map((item) => item.category), 'Gaji', 'Bonus', 'Transfer'])] }; },
  async getTransactions(month) { return { transactions: list(month) }; },
  async getTransaction(id) { const item = list().find((transaction) => transaction.id === id); if (!item) throw new Error('Transaksi tidak ditemukan.'); return { transaction: item }; },
  async createTransaction(fields) { const state = load(); const transaction = { ...fields, id: `demo-${Date.now()}`, timestamp: fields.timestamp || new Date().toISOString(), amount: Number(fields.amount), reporter: state.profile.phone, workspaceId: state.profile.workspaceId, status: 'active', source: 'web' }; state.transactions.push(transaction); save(state); return { transaction: visible(transaction, state.profile.phone) }; },
  async updateTransaction(id, fields) { const state = load(); const index = state.transactions.findIndex((item) => item.id === id); if (index < 0) throw new Error('Transaksi tidak ditemukan.'); state.transactions[index] = { ...state.transactions[index], ...fields, amount: Number(fields.amount ?? state.transactions[index].amount) }; save(state); return { transaction: visible(state.transactions[index], state.profile.phone) }; },
  async deleteTransaction(id) { const state = load(); const item = state.transactions.find((transaction) => transaction.id === id); if (item) item.status = 'deleted'; save(state); return { message: 'Transaksi berhasil dihapus.' }; },
  async getBudgets(month) { return { month, budgets: dashboard(month).budgets }; },
  async saveBudgets(_month, budgets) { const state = load(); state.budgets = budgets.map(({ category, amount }) => ({ category, amount: Number(amount) })); save(state); return { budgets: dashboard(currentMonth()).budgets }; },
  async getAccount() { return { profile: load().profile }; },
  async updateAccount(fields) { const state = load(); state.profile = { ...state.profile, ...fields }; save(state); return { profile: state.profile }; }
};
