const { validateConfig } = require('../src/config');
const { ensureDatabaseSchema } = require('../src/services/googleSheetsService');

validateConfig();
ensureDatabaseSchema()
    .then(() => console.log('Struktur Google Sheets siap.'))
    .catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
