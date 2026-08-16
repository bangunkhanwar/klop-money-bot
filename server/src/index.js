const { config, validateConfig } = require('./config');
const { createApp } = require('./app');
const { ensureDatabaseSchema } = require('./services/googleSheetsService');

async function main() {
    validateConfig();
    await ensureDatabaseSchema();

    let botStatusProvider = () => ({ state: config.botEnabled ? 'starting' : 'disabled', connected: false });
    const app = createApp({ getBotStatus: () => botStatusProvider() });
    const server = app.listen(config.port, config.host, () => {
        console.log(`Klop Money API aktif di http://${config.host}:${config.port}`);
    });

    let stopBot = async () => {};
    const apiOnly = process.argv.includes('--api-only');
    if (config.botEnabled && !apiOnly) {
        const bot = require('./bot/whatsapp');
        stopBot = bot.stopBot;
        botStatusProvider = bot.getBotStatus;
        bot.startBot().catch((error) => console.error('Bot WhatsApp gagal dimulai:', error.message));
    } else {
        console.log('Bot WhatsApp tidak dijalankan (mode API only).');
    }

    let shuttingDown = false;
    async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Menutup Klop Money dengan aman (${signal})...`);
        const forceTimer = setTimeout(() => process.exit(1), 10_000);
        forceTimer.unref();
        try {
            await stopBot();
            await new Promise((resolve) => server.close(resolve));
            clearTimeout(forceTimer);
            process.exit(0);
        } catch (error) {
            console.error(`Gagal menutup dengan aman: ${error.message}`);
            process.exit(1);
        }
    }

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
