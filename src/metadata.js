const _ = require('lodash');
const imdb = require('imdb');
const request = require('request');
const cacheManager = require('cache-manager');
const {escapeTitle} = require('./filter');

const CINEMETA_URL = process.env.CINEMETA_URL || 'https://v3-cinemeta.strem.io';
const KEY_PREFIX = 'streamio-ptb|metadata';
const METADATA_TTL = process.env.METADATA_TTL || 2 * 24 * 60 * 60; // 2 days

const cache = cacheManager.caching({store: 'memory', ttl: METADATA_TTL});

function _getMetadata(imdbId, type) {
  const key = `${KEY_PREFIX}:${imdbId}`;

  return cache.wrap(key, function () {
    return _getMetadataCinemeta(imdbId, type)
        .catch(err => _getMetadataImdb(imdbId)); // fallback to imdb search
  });
}

function _getMetadataImdb(imdbId) {
  return new Promise(function (resolve, rejected) {
    imdb(imdbId, function (err, data) {
      if (data) {
        resolve({
          title: escapeTitle(data.title),
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
              title: escapeTitle(body.meta.name),
              year: body.meta.year,
              episodeCount: body.meta.videos && _.chain(body.meta.videos)
                  .countBy('season')
                  .toPairs()
                  .filter(pair => pair[0] !== '0')
                  .sortBy(pair => parseInt(pair[0]))
                  .map(pair => pair[1])
                  .value()
            });
          } else {
            console.log(err || body);
            rejected(err || new Error("failed cinemeta query"))
          }
        }
    )
  });
}

async function seriesMetadata(args) {
  const idInfo = args.id.split(':');
  const imdbId = idInfo[0];
  const season = parseInt(idInfo[1]);
  const episode = parseInt(idInfo[2]);
  const seasonString = season < 10 ? `0${season}` : `${season}`;
  const episodeString = episode < 10 ? `0${episode}` : `${episode}`;

  const metadata = await _getMetadata(imdbId, args.type);
  const hasEpisodeCount = metadata.episodeCount && metadata.episodeCount.length >= season;
  return {
    imdb: imdbId,
    seriesTitle: metadata.title,
    episodeTitle: `${metadata.title} s${seasonString}e${episodeString}`,
    season: season,
    episode: episode,
    absoluteEpisode: hasEpisodeCount && metadata.episodeCount.slice(0, season - 1).reduce((a, b) => a + b, episode)
  };
}

async function movieMetadata(args) {
  const metadata = await _getMetadata(args.id, args.type);
  return {
    title: metadata.title,
    year: metadata.year
  };
}

module.exports = {movieMetadata, seriesMetadata};