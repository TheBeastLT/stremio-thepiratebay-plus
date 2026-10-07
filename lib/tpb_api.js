const axios = require('axios');
const Bottleneck = require('bottleneck');

const baseUrl = 'https://apibay.org';
const timeout = 5000;
const retryDelay = 1000;
const videoCategory = 200;

const limiter = new Bottleneck({ maxConcurrent: process.env.APIBAY_MAX_CONCURRENT || 4 });

function search(keyword, config = {}, retries = 2) {
  if (!keyword || retries === 0) {
    return Promise.reject(new Error(`Failed ${keyword} search`));
  }
  const cat = config.cat || videoCategory;

  return _request(`q.php?q=${keyword}&cat=${cat}`)
      .then((results) => results
          .map((result) => toTorrent(result))
          .filter((torrent) => torrent.infoHash !== '0000000000000000000000000000000000000000'))
      .catch(() => delay(retryDelay).then(() => search(keyword, config, retries - 1)));
}

function files(torrentId) {
  return _request(`f.php?id=${torrentId}`)
      .then(files => {
        if (files[0].name[0] === 'Filelist not found') {
          return Promise.reject('No files');
        }
        return files.map((file) => ({
          path: file.name[0],
          size: file.size[0]
        }));
      });
}

function _request(endpoint) {
  const url = `${baseUrl}/${endpoint}`;
  return limiter.schedule(() => axios.get(url, { timeout }))
      .then((response) => response.data);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTorrent(result) {
  return {
    id: result.id,
    name: result.name,
    size: result.size,
    seeders: result.seeders,
    infoHash: result.info_hash.toLowerCase()
  };
}

module.exports = { search, files };
