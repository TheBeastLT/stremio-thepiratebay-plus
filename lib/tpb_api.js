const axios = require('axios');
const pirata = require('./pirata');

const baseUrl = 'https://apibay.org';
const timeout = 5000;

function search(keyword, config = {}, retries = 2) {
  if (!keyword || retries === 0) {
    return pirata.search(keyword);
  }
  const q = keyword;
  const cat = config.cat || pirata.categories.Video;

  return _request(`q.php?q=${q}&cat=${cat}`)
      .then((results) => results
          .map((result) => toTorrent(result))
          .filter((torrent) => torrent.infoHash !== '0000000000000000000000000000000000000000'))
      .catch((err) => search(keyword, config, retries - 1));
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

async function _request(endpoint) {
  const url = `${baseUrl}/${endpoint}`;
  return axios.get(url, { timeout })
      .then((response) => response.data);
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
