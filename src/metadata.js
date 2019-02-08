const imdb = require('imdb');
const request = require('request');

module.exports.getMetadata = function (imdbId, type) {
  return _getMetadataCache(imdbId)
  .catch(err => _getMetadataCinemeta(imdbId, type))
  .catch(err => _getMetadataImdb(imdbId))
  .then(metadata => cache[imdbId] = metadata);
};

const cache = {};

function _getMetadataCache(imdbId) {
  return new Promise(function (resolve, rejected) {
    if (cache[imdbId]) {
      resolve(cache[imdbId]);
    } else {
      rejected(new Error("imdbId not cached"));
    }
  });
}

async function _getMetadataImdb(imdbId) {
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

const cinemetaUrl = process.env.CINEMETA_URL || 'https://v3-cinemeta.strem.io';

async function _getMetadataCinemeta(imdbId, type) {
  return new Promise(function (resolve, rejected) {
    request(
        `${cinemetaUrl}/meta/${type}/${imdbId}.json`,
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