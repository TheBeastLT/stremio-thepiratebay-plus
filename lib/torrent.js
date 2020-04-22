const torrentStream = require('torrent-stream');
const isVideo = require('is-video');
const tpb = require('./tpb_api.js');
const { cacheWrapTorrent, cacheWrapTorrentFiles } = require('./cache');

const MAX_PEER_CONNECTIONS = process.env.MAX_PEER_CONNECTIONS || 20;

// @TODO this is the biggest bottleneck now, explore options how to improve it.
module.exports.torrentFiles = function(torrent) {
  return cacheWrapTorrentFiles(torrent.infoHash, () => new Promise((resolve, rejected) => {
    const engine = new torrentStream(torrent.infoHash, { connections: MAX_PEER_CONNECTIONS });

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
    return 2000;
  } else if (torrent.seeders < 10) {
    return 3000;
  } else if (torrent.seeders < 20) {
    return 4000;
  } else if (torrent.seeders < 30) {
    return 5000;
  } else if (torrent.seeders < 50) {
    return 7000;
  } else if (torrent.seeders < 100) {
    return 10000;
  } else {
    return 15000;
  }
}

module.exports.torrentSearch = function(query, useCache = false, extendSearch = false) {
  if (!query) {
    return Promise.resolve([]);
  }
  const keyword = query.substring(0, 60);
  const search = () => tpbSearch(keyword, extendSearch)
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

function tpbSearch(query) {
  return tpb.search(query);
}
