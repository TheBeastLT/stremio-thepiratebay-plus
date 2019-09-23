const torrentStream = require('torrent-stream');
const isVideo = require('is-video');
const magnet = require('magnet-uri');
const pirata = require('./pirata.js');
const { cacheWrapTorrent, cacheWrapTorrentFiles } = require('./cache');

const PROXY_LIST = process.env.PROXIES ? process.env.PROXIES.split(',') : ['https://pirateproxy.sh'];
const MIN_SEEDS_TO_EXTEND = process.env.MIN_SEEDS_TO_EXTEND || 15;
const MAX_PAGES_TO_EXTEND = process.env.MAX_PAGES_TO_EXTEND || 2;
const MAX_PEER_CONNECTIONS = process.env.MAX_PEER_CONNECTIONS || 20;

// @TODO this is the biggest bottleneck now, explore options how to improve it.
module.exports.torrentFiles = function(torrent) {
  const { infoHash } = magnet.decode(torrent.magnetLink);
  return cacheWrapTorrentFiles(infoHash, () => new Promise((resolve, rejected) => {
    const engine = new torrentStream(torrent.magnetLink, { connections: MAX_PEER_CONNECTIONS });

    engine.ready(() => {
      const files = engine.files
          .map((file, fileId) => `${fileId}@@${file.path.replace(/^[^\/]+\//, '')}`)
          .filter((file) => isVideo(file));

      engine.destroy();
      resolve(files);
    });
    setTimeout(() => {
      engine.destroy();
      rejected(new Error('No available connections for torrent!'));
    }, dynamicTimeout(torrent));
  }));
};

function dynamicTimeout(torrent) {
  if (torrent.seeders < 5) {
    return 1000;
  } else if (torrent.seeders < 10) {
    return 2000;
  } else if (torrent.seeders < 20) {
    return 3000;
  } else if (torrent.seeders < 30) {
    return 4000;
  } else if (torrent.seeders < 50) {
    return 5000;
  } else if (torrent.seeders < 100) {
    return 60000;
  } else {
    return 7000;
  }
}

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
      .catch((error) => {
        console.log(`failed "${keyword}" query: ${error}`);
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
