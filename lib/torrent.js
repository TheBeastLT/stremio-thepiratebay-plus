const torrentStream = require('torrent-stream');
const isVideo = require('is-video');
const tpb = require('./tpb_api.js');
const { cacheWrapTorrent, cacheWrapTorrentFiles } = require('./cache');

const MAX_PEER_CONNECTIONS = process.env.MAX_PEER_CONNECTIONS || 20;

module.exports.torrentFiles = function(torrent) {
  return cacheWrapTorrentFiles(torrent.infoHash, () => filesFromApi(torrent)
      .catch(() => filesFromTorrentStream(torrent))
      .then(files => files
          .map((file, fileId) => `${fileId}@@${file.path.replace(/^[^\/]+\//, '')}@@${file.size}`)
          .filter((file) => isVideo(file.split('@@')[1]))));
};

function filesFromApi(torrent) {
  if (!torrent || !torrent.id) {
      return Promise.reject('No torrentId available!')
  }
  return tpb.files(torrent.id);
}

function filesFromTorrentStream(torrent) {
  return new Promise((resolve, rejected) => {
    const engine = new torrentStream(torrent.infoHash, { connections: MAX_PEER_CONNECTIONS });

    engine.ready(() => {
      const files = engine.files.map((file) => ({
        path: file.path,
        size: file.length
      }));
      engine.destroy();
      resolve(files);
    });
    setTimeout(() => {
      engine.destroy();
      rejected(new Error('No available connections for torrent!'));
    }, dynamicTimeout(torrent));
  });
}

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

module.exports.torrentSearch = function(query, useCache = false) {
  if (!query) {
    return Promise.resolve([]);
  }
  const keyword = query.substring(0, 60);
  const search = () => tpb.search(keyword)
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
