const torrentStream = require('torrent-stream');
const pirata = require('./pirata.js');
const { cacheWrapTorrent } = require('./cache');

const PROXY_LIST = process.env.PROXIES
    ? process.env.PROXIES.split(',')
    : ['https://pirateproxy.sh'];

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

module.exports.torrentSearch = function(query, useCache = false) {
  if (!query) {
    return Promise.resolve([]);
  }
  const keyword = query.substring(0, 60);
  const search = () => pirataSearch(keyword)
      .catch(() => {
        console.log(`failed "${keyword}" query.`);
        return [];
      });

  return useCache ? cacheWrapTorrent(keyword, search) : search();
};

// @TODO add auto re-query next page based on last torrent seeder count
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
