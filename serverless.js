const { getRouter } = require('stremio-addon-sdk');
const landingTemplate = require('stremio-addon-sdk/src/landingTemplate');
const addonInterface = require('./addon');
const router = getRouter(addonInterface);

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
