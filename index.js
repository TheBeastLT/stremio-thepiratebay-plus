const { serveHTTP, publishToCentral } = require('stremio-addon-sdk');
const addonInterface = require('./addon');

const PORT = process.env.PORT || 7000;
const ENDPOINT = process.env.ENDPOINT || `http://localhost:${PORT}`;

serveHTTP(addonInterface, { port: PORT, cacheMaxAge: 86400, static: '/static' });
publishToCentral(`${ENDPOINT}/manifest.json`);
