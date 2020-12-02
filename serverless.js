const rateLimit = require('express-rate-limit');
const { getRouter } = require('stremio-addon-sdk');
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate');
const addonInterface = require('./addon');
const router = getRouter(addonInterface);

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 10 seconds
  max: 200, // limit each IP to 200 requests per windowMs
  headers: false
});

router.use(limiter);

router.get('/', (_, res) => {
  const landingHTML = landingTemplate(addonInterface.manifest);
  res.setHeader('content-type', 'text/html');
  res.end(landingHTML);
});

module.exports = function(req, res) {
  router(req, res, function() {
    res.statusCode = 404;
    res.end();
  });
};
