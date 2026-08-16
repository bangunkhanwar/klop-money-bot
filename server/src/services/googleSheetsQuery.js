const { listTransactions, getPairings } = require('./googleSheetsService');

async function getSheetData(workspaceId, viewerPhone) {
    try {
        return await listTransactions({ workspaceId, viewerPhone, limit: 500 });
    } catch (error) {
        console.error('Gagal membaca Google Sheets:', error.message);
        return null;
    }
}

function filterByType(data, type) {
    if (!data?.length) return [];
    return data.filter((item) => item.type?.toLowerCase() === type.toLowerCase());
}

function filterByDate(rows, period) {
    const now = new Date();
    const start = new Date(now);
    if (period === 'today') start.setHours(0, 0, 0, 0);
    else if (period === 'week') start.setDate(now.getDate() - 7);
    else if (period === 'month') start.setDate(1), start.setHours(0, 0, 0, 0);
    else return rows;
    return rows.filter((row) => {
        const date = new Date(row.timestamp);
        return !Number.isNaN(date.getTime()) && date >= start && date <= now;
    });
}

function calculateTotal(rows) {
    return rows.reduce((total, row) => total + (Number(row.amount) || 0), 0);
}

function groupByCategory(rows) {
    return rows.reduce((categories, row) => {
        const category = row.category || 'Lainnya';
        categories[category] = (categories[category] || 0) + (Number(row.amount) || 0);
        return categories;
    }, {});
}

function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
}

function periodLabel(period) {
    if (period === 'today') return 'Hari Ini';
    if (period === 'week') return 'Minggu Ini';
    return 'Bulan Ini';
}

async function getReport(type, period, workspaceId, viewerPhone) {
    const data = await getSheetData(workspaceId, viewerPhone);
    if (!data) return 'Gagal membaca data dari Google Sheets.';
    const rows = filterByDate(filterByType(data, type), period);
    if (!rows.length) return `Tidak ada data ${type.toLowerCase()} ${periodLabel(period).toLowerCase()}.`;
    const total = calculateTotal(rows);
    const categories = Object.entries(groupByCategory(rows)).sort((a, b) => b[1] - a[1]);
    let report = `📊 *Laporan ${type} ${periodLabel(period)}*\n\n`;
    report += `Total: ${formatRupiah(total)}\nJumlah transaksi: ${rows.length}\n\n*Rincian per Kategori:*\n`;
    categories.forEach(([category, amount]) => {
        const percentage = total > 0 ? ((amount / total) * 100).toFixed(1) : '0.0';
        report += `- ${category}: ${formatRupiah(amount)} (${percentage}%)\n`;
    });
    return report;
}

async function getFullReport(period, workspaceId, viewerPhone) {
    const data = await getSheetData(workspaceId, viewerPhone);
    if (!data) return 'Gagal membaca data dari Google Sheets.';
    const incomeRows = filterByDate(filterByType(data, 'Pemasukan'), period);
    const expenseRows = filterByDate(filterByType(data, 'Pengeluaran'), period);
    const income = calculateTotal(incomeRows);
    const expense = calculateTotal(expenseRows);
    const balance = income - expense;
    let report = `📊 *REKAP KEUANGAN ${periodLabel(period).toUpperCase()}*\n\n`;
    report += `💰 Pemasukan: ${formatRupiah(income)}\n💸 Pengeluaran: ${formatRupiah(expense)}\n`;
    report += `📈 Selisih: ${formatRupiah(balance)} (${balance >= 0 ? 'Surplus' : 'Defisit'})\n\n`;
    const categories = Object.entries(groupByCategory(expenseRows)).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (categories.length) {
        report += '*Top 5 Pengeluaran:*\n';
        categories.forEach(([category, amount]) => { report += `- ${category}: ${formatRupiah(amount)}\n`; });
    }
    return report;
}

async function loadPairingFromSheet() {
    try {
        const pairings = await getPairings();
        console.log(`Memuat ${pairings.length} data pairing dari Google Sheets.`);
        return pairings;
    } catch (error) {
        console.error('Gagal memuat pairing:', error.message);
        return [];
    }
}

module.exports = { getReport, getFullReport, getSheetData, loadPairingFromSheet };
