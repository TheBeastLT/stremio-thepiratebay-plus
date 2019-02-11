const torrentStream = require('torrent-stream');
const cacheManager = require('cache-manager');
const mangodbStore = require('cache-manager-mongodb');
const pirata = require('./pirata.js');

const KEY_PREFIX = 'streamio-ptb|torrent';
const MONGO_URI = process.env.MONGODB_URI;
const TORRENT_TTL = process.env.TORRENT_TTL || 6 * 60 * 60; // 6 hours
const PROXY_LIST = process.env.PROXIES
    ? process.env.PROXIES.split(',')
    : ['https://pirateproxy.sh'];

const cache = MONGO_URI
    ? cacheManager.caching({
      store: mangodbStore,
      uri: MONGO_URI,
      options: {
        collection: 'cacheManager',
        ttl: TORRENT_TTL
      },
      ttl: TORRENT_TTL,
      ignoreCacheErrors: true
    })
    : cacheManager.caching({
      store: 'memory',
      ttl: TORRENT_TTL
    });

module.exports.torrentFiles = function(magnetLink) {
  return new Promise((resolve, rejected) => {
    const engine = new torrentStream(magnetLink);

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
    }, 3000);
  });
};

module.exports.torrentSearch = function(query, page = 0) {
  if (!query) {
    return Promise.resolve([]);
  }
  query = query.substring(0, 60);
  const key = `${KEY_PREFIX}:${query}`;

  return cache.wrap(key, () => pirataSearch(query))
      .catch(() => {
        console.log(`failed "${query}" query.`);
        return [];
      });
};

function pirataSearch(query, page = 0) {
  return pirata.search(
      query,
      {
        proxyList: PROXY_LIST,
        timeout: 3000,
        cat: pirata.categories.Video,
        page
      }
  ).then((results) => {
    console.log(`pirata: ${query}=${results.length}`);
    return results;
  });
}
