const request = require('request-promise');
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
      .catch((err) => search(keyword, config, retries - 1));
}

async function _request(endpoint) {
  const url = `${baseUrl}/${endpoint}`;
  return request.get(url, { timeout })
      .then((data) => JSON.parse(data))
      .then((results) => results.map((result) => toTorrent(result)));
}

function toTorrent(result) {
  return {
    name: result.name,
    size: result.size,
    seeders: result.seeders,
    infoHash: result.info_hash.toLowerCase()
  };
}

module.exports = { search };
