const cheerio = require('cheerio');
const request = require('request');

const defaultProxies = ['https://pirateproxy.sh'];
const defaultTimeout = 5000;

const errors = {
  REQUEST_ERROR: { code: 'REQUEST_ERROR' },
  PARSER_ERROR: { code: 'PARSER_ERROR' }
};

categories = {
  Audio: 100,
  Video: 200,
  Apps: 300,
  Games: 400,
  Porn: 500
};

function search(keyword, config = {}, retries = 2) {
  if (!keyword || retries === 0) {
    return Promise.reject(new Error(`Failed ${keyword} search`));
  }
  const proxyList = config.proxyList || defaultProxies;

  return raceFirstSuccessful(proxyList
      .map((proxyUrl) => singleRequest(keyword, proxyUrl, config)))
      .then((body) => parseBody(body))
      .catch(() => search(keyword, config, retries - 1));
}

function singleRequest(keyword, url, config = {}) {
  const timeout = config.timeout || defaultTimeout;
  const page = config.page || 0;
  const category = config.cat || 0;

  const requestURL = `${url}/search/${keyword}/${page}/99/${category}`;

  return new Promise(((resolve, reject) => {
    request.get(requestURL,
        { timeout },
        (err, res, body) => {
          if (err || !body) {
            reject(err || errors.REQUEST_ERROR);
          } else if (body.includes('Access Denied') && !body.includes('<title>The Pirate Bay')) {
            console.log(`Access Denied: ${url}`);
            reject(new Error(`Access Denied: ${url}`));
          } else if (body.includes('502: Bad gateway') ||
            body.includes('403 Forbidden') ||
            body.includes('Database maintenance') ||
            body.includes('Origin DNS error') ||
            !body.includes('<title>The Pirate Bay')) {
            reject(errors.REQUEST_ERROR);
          }

          resolve(body);
        });
  }));
}

function parseBody(body) {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(body);

    if (!$) {
      reject(new Error(errors.PARSER_ERROR));
    }

    const torrents = [];

    $('table[id=\'searchResult\'] tr').each(function() {
      const torrent = {
        name: $(this).find('.detLink').text(),
        seeders: parseInt($(this).find('td[align=\'right\']').eq(0).text(), 10),
        leechers: parseInt($(this).find('td[align=\'right\']').eq(1).text(), 10),
        magnetLink: $(this).find('a[title=\'Download this torrent using magnet\']').attr('href')
      };

      if (torrent.name) {
        torrents.push(torrent);
      }
    });
    resolve(torrents);
  });
}

function raceFirstSuccessful(promises) {
  return Promise.all(promises.map((p) => {
    // If a request fails, count that as a resolution so it will keep
    // waiting for other possible successes. If a request succeeds,
    // treat it as a rejection so Promise.all immediately bails out.
    return p.then(
        (val) => Promise.reject(val),
        (err) => Promise.resolve(err)
    );
  })).then(
      // If '.all' resolved, we've just got an array of errors.
      (errors) => Promise.reject(errors),
      // If '.all' rejected, we've got the result we wanted.
      (val) => Promise.resolve(val)
  );
}

module.exports = { search, categories };
