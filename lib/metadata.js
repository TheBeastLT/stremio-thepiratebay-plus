const _ = require('lodash');
const imdb = require('imdb');
const axios = require('axios');
const { cacheWrapMetadata, updateMetadata } = require('./cache');
const { escapeTitle } = require('./filter');

const CINEMETA_URL = process.env.CINEMETA_URL || 'https://v3-cinemeta.strem.io';

function getMetadata(imdbId, type) {
  return cacheWrapMetadata(imdbId, () => getMetadataCinemeta(imdbId, type)
      .catch(() => getMetadataImdb(imdbId))); // fallback to imdb search
}

function getMetadataImdb(imdbId) {
  return new Promise(((resolve, rejected) => {
    imdb(imdbId, (err, data) => {
      if (data && data.title) {
        resolve({
          title: escapeTitle(data.title),
          year: data.year
        });
      } else {
        console.log(`failed imdb query: ${err || 'Unknown error'}`);
        rejected(err || new Error('failed imdb query'));
      }
    });
  }));
}

function getMetadataCinemeta(imdbId, type) {
  return axios.get(`${CINEMETA_URL}/meta/${type}/${imdbId}.json`)
      .then((response) => {
        const data = response.data;
        if (data && data.meta && data.meta.name) {
          return {
            title: escapeTitle(data.meta.name),
            year: data.meta.year,
            episodeCount: data.meta.videos && _.chain(data.meta.videos)
                .countBy('season')
                .toPairs()
                .filter((pair) => pair[0] !== '0')
                .sortBy((pair) => parseInt(pair[0], 10))
                .map((pair) => pair[1])
                .value()
          };
        }
        return Promise.reject(new Error('Empty Body'));
      })
      .catch((error) => {
        console.log(`failed cinemeta query: ${error || 'Empty Body'}`);
        return Promise.reject(new Error('failed cinemeta query'));
      });
}

async function addCommunityTitle(imdbId, communityTitle) {
  updateMetadata(imdbId, (metadata) => {
    metadata.communityTitle = communityTitle;
    return metadata;
  });
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
    title: metadata.title,
    communityTitle: metadata.communityTitle,
    episodeTitle: `${metadata.title} s${seasonString}e${episodeString}`,
    season,
    episode,
    absoluteEpisode: hasEpisodeCount && metadata.episodeCount.slice(0, season - 1).reduce((a, b) => a + b, episode),
    totalEpisodes: hasEpisodeCount && metadata.episodeCount.reduce((a, b) => a + b, 0),
    episodesInSeason: hasEpisodeCount && metadata.episodeCount[season - 1]
  };
}

async function movieMetadata(args) {
  const metadata = await getMetadata(args.id, args.type);

  return {
    title: metadata.title,
    year: metadata.year
  };
}

module.exports = { movieMetadata, seriesMetadata, addCommunityTitle };
