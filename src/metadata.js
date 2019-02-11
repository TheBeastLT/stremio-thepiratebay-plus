const _ = require('lodash');
const imdb = require('imdb');
const request = require('request');
const cacheManager = require('cache-manager');
const { escapeTitle } = require('./filter');

const CINEMETA_URL = process.env.CINEMETA_URL || 'https://v3-cinemeta.strem.io';
const KEY_PREFIX = 'streamio-ptb|metadata';
const METADATA_TTL = process.env.METADATA_TTL || 2 * 24 * 60 * 60; // 2 days

const cache = cacheManager.caching({ store: 'memory', ttl: METADATA_TTL });

function getMetadata(imdbId, type) {
  const key = `${KEY_PREFIX}:${imdbId}`;

  return cache.wrap(key, () => getMetadataCinemeta(imdbId, type)
      .catch(() => getMetadataImdb(imdbId))); // fallback to imdb search
}

function getMetadataImdb(imdbId) {
  return new Promise(((resolve, rejected) => {
    imdb(imdbId, (err, data) => {
      if (data) {
        resolve({
          title: escapeTitle(data.title),
          year: data.year
        });
      } else {
        rejected(err || new Error('failed imdb query'));
      }
    });
  }));
}

function getMetadataCinemeta(imdbId, type) {
  return new Promise(((resolve, rejected) => {
    request(
        `${CINEMETA_URL}/meta/${type}/${imdbId}.json`,
        (err, res, body) => {
          const data = JSON.parse(body);
          if (data && data.meta && data.meta.name) {
            resolve({
              title: escapeTitle(data.meta.name),
              year: data.meta.year,
              episodeCount: data.meta.videos && _.chain(data.meta.videos)
                  .countBy('season')
                  .toPairs()
                  .filter((pair) => pair[0] !== '0')
                  .sortBy((pair) => parseInt(pair[0], 10))
                  .map((pair) => pair[1])
                  .value()
            });
          } else {
            console.log(err);
            rejected(err || new Error('failed cinemeta query'));
          }
        }
    );
  }));
}

async function seriesMetadata(args) {
  const idInfo = args.id.split(':');
  const imdbId = idInfo[0];
  const season = parseInt(idInfo[1], 10);
  const episode = parseInt(idInfo[2], 10);
  const seasonString = season < 10 ? `0${season}` : `${season}`;
  const episodeString = episode < 10 ? `0${episode}` : `${episode}`;

  const metadata = await getMetadata(imdbId, args.type);
  const hasEpisodeCount = metadata.episodeCount && metadata.episodeCount.length >= season;

  return {
    imdb: imdbId,
    seriesTitle: metadata.title,
    episodeTitle: `${metadata.title} s${seasonString}e${episodeString}`,
    season,
    episode,
    absoluteEpisode: hasEpisodeCount && metadata.episodeCount.slice(0, season - 1).reduce((a, b) => a + b, episode)
  };
}

async function movieMetadata(args) {
  const metadata = await getMetadata(args.id, args.type);

  return {
    title: metadata.title,
    year: metadata.year
  };
}

module.exports = { movieMetadata, seriesMetadata };
