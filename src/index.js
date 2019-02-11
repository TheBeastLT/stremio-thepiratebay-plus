const _ = require('lodash');
const addonSDK = require('stremio-addon-sdk');
const isVideo = require('is-video');
const { torrentSearch, torrentFiles } = require('./torrent');
const { movieStream, seriesStream } = require('./streamInfo');
const { movieMetadata, seriesMetadata } = require('./metadata');
const { cacheWrapStream } = require('./cache');
const {
  filterMovieTitles,
  filterSeriesTitles,
  filterSeriesEpisodes
} = require('./filter');

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

  if (args.type === 'series') {
    return cacheWrapStream(args.id, () => seriesStreamHandler(args))
        .then((streams) => {
          console.log('streams: ', streams.map((stream) => stream.title));
          return callback(null, { streams });
        })
        .catch((error) => {
          console.log(error);
          return callback(new Error(error.message));
        });
  } else if (args.type === 'movie') {
    return cacheWrapStream(args.id, () => movieStreamHandler(args))
        .then((streams) => {
          console.log('streams: ', streams.map((stream) => stream.title));
          return callback(null, { streams });
        })
        .catch((error) => {
          console.log(error);
          return callback(new Error(error.message));
        });
  }
  return callback(null, { streams: [] });
});

async function seriesStreamHandler(args, callback) {
  const seriesInfo = await seriesMetadata(args).catch((error) => {
    console.log(error);
    return {};
  });

  // Cache torrents from imdb and title queries, cause they can be used by other episodes queries.
  // No need to cache episode query torrent, since it's better to cache the constructed streams.
  return Promise.all([
    torrentSearch(seriesInfo.imdb, true)
        .then((torrents) => filterSeriesTitles(torrents, seriesInfo, true)),
    torrentSearch(seriesInfo.seriesTitle, true)
        .then((torrents) => filterSeriesTitles(torrents, seriesInfo)),
    torrentSearch(seriesInfo.episodeTitle)
        .then((torrents) => filterSeriesTitles(torrents, seriesInfo))
  ])
      .then((results) => _.uniqBy(_.flatten(results), 'magnetLink')
          .filter((torrent) => torrent.seeders > 0)
          .sort((a, b) => b.seeders - a.seeders)
          .slice(0, 5))
      .then((torrents) => {
        console.log('found torrents: ', torrents.map((torrent) => `${torrent.name}:${torrent.seeders}`));
        return Promise.all(torrents.map((torrent) => findEpisodes(torrent, seriesInfo)));
      })
      .then((torrents) => torrents
          .filter((torrent) => torrent.episodes)
          .map((torrent) => torrent.episodes
              .map((episode) => seriesStream(torrent, episode)))
          .reduce((a, b) => a.concat(b), [])
          .filter((stream) => stream.infoHash));
}

async function movieStreamHandler(args) {
  const movieInfo = await movieMetadata(args).catch(() => {});

  // No need to cache torrent query results, since it's better to cache the constructed streams.
  return Promise.all([
    torrentSearch(args.id),
    torrentSearch(movieInfo.title)
        .then((torrents) => filterMovieTitles(torrents, movieInfo))
  ])
      .then((results) => _.uniqBy(_.flatten(results), 'magnetLink')
          .filter((torrent) => torrent.seeders > 0)
          .sort((a, b) => b.seeders - a.seeders)
          .slice(0, 4)
          .map((torrent) => movieStream(torrent)));
}

/*
 * Reads torrent files and tries to find series episodes matches.
 */
function findEpisodes(torrent, seriesInfo) {
  return torrentFiles(torrent.magnetLink)
      .then((files) => {
        let episodes = filterSeriesEpisodes(
            files.filter((file) => isVideo(file.name)),
            seriesInfo.season,
            seriesInfo.episode
        );

        // try to prune out extras
        if (episodes.length > 1) {
          const pruned = episodes.filter((episode) => episode.name.match(/extra/gi));

          if (pruned.length > 0) {
            episodes = pruned;
          }
        }

        torrent.episodes = episodes.length > 0 ? episodes : null;
        return torrent;
      })
      .catch(() => {
        console.log(`failed opening: ${torrent.name}:${torrent.seeders}`);
        return torrent;
      });
}

const url = process.env.ENDPOINT
    ? `${process.env.ENDPOINT}/manifest.json`
    : 'https://localhost:7000/manifest.json';

addon.runHTTPWithOptions({ port: process.env.PORT || 7000 });
addon.publishToWeb(url);
addon.publishToCentral(url);
