const torrentStream = require('torrent-stream');
const pirata = require('./pirata.js');
const { cacheWrapTorrent } = require('./cache');

const PROXY_LIST = process.env.PROXIES
    ? process.env.PROXIES.split(',')
    : ['https://pirateproxy.sh'];
const MIN_SEEDS_TO_EXTEND = process.env.MIN_SEEDS_TO_EXTEND || 20;
const MAX_PAGES_TO_EXTEND = process.env.MAX_PAGES_TO_EXTEND || 2;

module.exports.torrentFiles = function(magnetLink) {
  return new Promise((resolve, rejected) => {
    const engine = new torrentStream(magnetLink, { connections: 10 });

    engine.ready(() => {
      const files = engine.files
          .map((file, fileId) => ({
            name: file.name,
            index: fileId,
            size: file.length
          }));

      engine.destroy();
      resolve(files);
    });
    setTimeout(() => {
      engine.destroy();
      rejected(new Error('No available connections for torrent!'));
    }, 5000);
  });
};

module.exports.torrentSearch = function(query, useCache = false, extendSearch = false) {
  if (!query) {
    return Promise.resolve([]);
  }
  const keyword = query.substring(0, 60);
  const search = () => pirataSearch(keyword, extendSearch)
      .then((results) => {
        console.log(`pirata: ${query}=${results.length}`);
        return results;
      });

  return (useCache ? cacheWrapTorrent(keyword, search) : search())
      .catch(() => {
        console.log(`failed "${keyword}" query.`);
        return [];
      });
};

function pirataSearch(query, extendSearch = false, page = 0) {
  return pirata.search(
      query,
      {
        proxyList: PROXY_LIST,
        timeout: 3000,
        cat: pirata.categories.Video,
        page: page
      }
  ).then((results) => {
    if (extendSearch &&
      results.length &&
      page < MAX_PAGES_TO_EXTEND &&
      results[results.length - 1].seeders >= MIN_SEEDS_TO_EXTEND) {
      console.log(`extending ${query}: page=${page} seeds=${results[results.length - 1].seeders}`);
      return pirataSearch(query, extendSearch, page + 1)
          .then((extended) => results.concat(extended));
    }
    return results;
  });
}
