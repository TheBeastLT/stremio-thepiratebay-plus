const _ = require('lodash');
const addonSDK = require('stremio-addon-sdk');
const isVideo = require('is-video');
const { torrentSearch, torrentFiles } = require('./torrent');
const { movieStream, seriesStream } = require('./streamInfo');
const { movieMetadata, seriesMetadata } = require('./metadata');
const { cacheWrapStream } = require('./cache');
const {
  filterMovieTitles,
  canContainEpisode,
  containSingleEpisode,
  isCorrectEpisode
} = require('./filter');

const URL = process.env.ENDPOINT
  ? `${process.env.ENDPOINT}/manifest.json`
  : 'https://localhost:7000/manifest.json';
const EMPTY_OBJECT = {};

const addon = new addonSDK({
  id: 'com.stremio.thepiratebay.plus',
  version: '1.0.0',
  name: 'ThePirateBay+',
  description: 'Search for movies and series from ThePirateBay',
  catalogs: [],
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  background: 'http://wallpapercraze.com/images/wallpapers/thepiratebay-77708.jpeg',
  logo: 'https://cdn.freebiesupply.com/logos/large/2x/the-pirate-bay-logo-png-transparent.png',
  contactEmail: 'pauliox@beyond.lt'
});

addon.defineStreamHandler((args, callback) => {
  if (!args.id.match(/tt\d+/i)) {
    return callback(null, { streams: [] });
  }

  const handlers = {
    series: () => seriesStreamHandler(args),
    movie: () => movieStreamHandler(args),
    fallback: () => []
  };

  return cacheWrapStream(args.id, handlers[args.type] || handlers.fallback)
      .then((streams) => callback(null, { streams }))
      .catch((error) => {
        console.log(error);
        return callback(new Error(error.message));
      });
});

async function seriesStreamHandler(args) {
  const seriesInfo = await seriesMetadata(args).catch(() => EMPTY_OBJECT);

  // Cache torrents from imdb and title queries, cause they can be used by other episodes queries.
  // No need to cache episode query torrent, since it's better to cache the constructed streams.
  // @TODO when caching disjoin imdb and title results to cache only unique torrents to save space
  const results = await Promise.all([
    torrentSearch(seriesInfo.imdb, true, true),
    torrentSearch(seriesInfo.seriesTitle, true, true),
    torrentSearch(seriesInfo.episodeTitle)
  ]);

  const torrentsToOpen = _.uniqBy(_.flatten(results), 'magnetLink')
      .filter((torrent) => torrent.seeders > 0)
      .filter((torrent) => canContainEpisode(torrent, seriesInfo, results[0].includes(torrent))) // for imdb search results we want to check only season info
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, 5)
      .map((torrent) => findEpisodes(torrent, seriesInfo));
  const torrents = await Promise.all(torrentsToOpen);
  console.log('found torrents: ', torrents.map((torrent) => `${torrent.name}:${torrent.seeders}`));

  const streams = torrents
      .filter((torrent) => torrent.episodes)
      .map((torrent) => torrent.episodes
          .map((episode) => seriesStream(torrent, episode)))
      .reduce((a, b) => a.concat(b), [])
      .slice(0, 10)
      .filter((stream) => stream.infoHash);
  console.log('streams: ', streams.map((stream) => stream.title));
  return streams;
}

async function movieStreamHandler(args) {
  const movieInfo = await movieMetadata(args).catch(() => EMPTY_OBJECT);

  // No need to cache torrent query results, since it's better to cache the constructed streams.
  const results = await Promise.all([
    torrentSearch(args.id),
    torrentSearch(movieInfo.title)
        .then((torrents) => filterMovieTitles(torrents, movieInfo))
  ]);

  return _.uniqBy(_.flatten(results), 'magnetLink')
      .filter((torrent) => torrent.seeders > 0)
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, 4)
      .map((torrent) => movieStream(torrent));
}

/*
 * Reads torrent files and tries to find series episodes matches.
 */
function findEpisodes(torrent, seriesInfo) {
  if (containSingleEpisode(torrent, seriesInfo)) {
    // no need to open torrent containing just the correct episode
    torrent.episodes = [{ name: torrent.name }];
    return Promise.resolve(torrent);
  }

  const season = seriesInfo.season;
  const episode = seriesInfo.episode;
  const absEpisode = seriesInfo.absoluteEpisode;
  return torrentFiles(torrent.magnetLink)
      .then((files) => {
        let episodes = files
            .filter((file) => isVideo(file.name))
            .filter((file) => isCorrectEpisode(file, seriesInfo))
            .sort((a, b) => a.episode - b.episode);

        // try to prune out extras/samples
        if (episodes.length > 1) {
          const pruned = episodes.filter((episode) => !episode.name.match(/extra|sample/gi));

          if (pruned.length > 0) {
            episodes = pruned;
          }
        }
        // try to detect most probable episode
        if (episodes.length > 1) {
          if (episodes.find((file) => file.season === season && file.episode === absEpisode)) {
            // Episode can follow absolute episode structure but be placed inside a season folder
            episodes = episodes.filter((file) => file.season === season && file.episode === absEpisode);
          } else {
            // in case of absolute episode both 001 and 101 for S01E01 are valid
            // but if both of these cases are present we only want the 001
            // so we take the min from available episodes
            episodes = episodes.filter((file) => file.episode <= episodes[0].episode);
          }
        }

        torrent.episodes = episodes.length > 0 ? episodes : null;
        return torrent;
      })
      .catch((error) => {
        console.log(error);
        console.log(`failed opening: ${torrent.name}:${torrent.seeders}`);
        return torrent;
      });
}

addon.runHTTPWithOptions({ port: process.env.PORT || 7000 });
addon.publishToWeb(URL);
addon.publishToCentral(URL);
