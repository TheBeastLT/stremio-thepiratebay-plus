const imdb = require('imdb');
const request = require('request');
const cacheManager = require('cache-manager');

const CINEMETA_URL = process.env.CINEMETA_URL || 'https://v3-cinemeta.strem.io';
const KEY_PREFIX = 'streamio-ptb|metadata';
const METADATA_TTL = process.env.METADATA_TTL || 2 * 24 * 60 * 60; // 2 days

const cache = cacheManager.caching({store: 'memory', ttl: METADATA_TTL});

module.exports.getMetadata = function (imdbId, type) {
  const key = `${KEY_PREFIX}:${imdbId}`;

  return cache.wrap(key, function () {
    return _getMetadataCinemeta(imdbId, type)
        .catch(err => _getMetadataImdb(imdbId)); // fallback to imdb search
  });
};

function _getMetadataImdb(imdbId) {
  return new Promise(function (resolve, rejected) {
    imdb(imdbId, function (err, data) {
      if (data) {
        resolve({
          title: data.title,
          year: data.year
        });
      } else {
        rejected(new Error("failed imdb query"));
      }
    });
  });
}

function _getMetadataCinemeta(imdbId, type) {
  return new Promise(function (resolve, rejected) {
    request(
        `${CINEMETA_URL}/meta/${type}/${imdbId}.json`,
        (err, res, body) => {
          body = JSON.parse(body);
          if (body && body.meta && body.meta.name) {
            resolve({
              title: body.meta.name,
              year: body.meta.year
            });
          } else {
            console.log(err || body);
            rejected(err || new Error("failed cinemeta query"))
          }
        }
    )
  });
}