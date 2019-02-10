const _ = require('lodash');
const addonSDK = require('stremio-addon-sdk');
const videoExtensions = require('video-extensions');
const {torrentSearch, torrentFiles} = require('./torrent');
const {movieStream, seriesStream} = require('./streamInfo');
const {getMetadata} = require('./metadata');
const {
  escapeTitle,
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

addon.defineStreamHandler(async function (args, callback) {
  if (!args.id.match(/tt\d+/i)) {
    return callback(null, {streams: []});
  }

  if (args.type === 'series') {
    return seriesStreamHandler(args, callback);
  } else {
    return movieStreamHandler(args, callback);
  }
});

async function seriesStreamHandler(args, callback) {
  const seriesInfo = await seriesInformation(args).catch(err => {
  });

  return Promise.all([
    torrentSearch(seriesInfo.imdb)
        .then(torrents => filterSeriesTitles(torrents, seriesInfo, true)),
    torrentSearch(seriesInfo.seriesTitle)
        .then(torrents => filterSeriesTitles(torrents, seriesInfo)),
    torrentSearch(seriesInfo.episodeTitle)
        .then(torrents => filterSeriesTitles(torrents, seriesInfo))
  ])
      .then(results => _.uniqBy(_.flatten(results), 'magnetLink')
          .filter(torrent => torrent.seeders > 0)
          .sort((a, b) => b.seeders - a.seeders)
          .slice(0, 5))
      .then(torrents => {
        console.log('found torrents: ', torrents.map(torrent => `${torrent.name}:${torrent.seeders}`));
        return Promise.all(torrents.map(torrent => findEpisodes(torrent, seriesInfo)))
      })
      .then(torrents => torrents
          .filter(torrent => torrent.episodes)
          .map(torrent => torrent.episodes
              .map(episode => seriesStream(torrent, episode)))
          .reduce((a, b) => a.concat(b), [])
          .filter(stream => stream.infoHash))
      .then(streams => {
        console.log('streams: ', streams.map(stream => stream.title));
        return callback(null, {streams: streams});
      })
      .catch(error => {
        console.log(error);
        return callback(new Error(error.message))
      });
}

async function movieStreamHandler(args, callback) {
  const movieInfo = await movieInformation(args).catch(err => {
  });

  return Promise.all([
    torrentSearch(args.id),
    torrentSearch(movieInfo.title)
        .then(torrents => filterMovieTitles(torrents, movieInfo))
  ])
      .then(results => _.uniqBy(_.flatten(results), 'magnetLink')
          .filter(torrent => torrent.seeders > 0)
          .sort((a, b) => b.seeders - a.seeders)
          .slice(0, 4)
          .map(torrent => movieStream(torrent)))
      .then(streams => callback(null, {streams: streams}))
      .catch(error => {
        console.log(error);
        return callback(new Error(error.message))
      });
}

/*
 * Reads torrent files and tries to find series episodes matches.
 */
async function findEpisodes(torrent, seriesInfo) {
  return torrentFiles(torrent.magnetLink)
      .then(files => {
        let episodes = filterSeriesEpisodes(
            files.filter(file => videoExtensions.includes(file.name.split('.').pop())),
            seriesInfo.season,
            seriesInfo.episode
        );

        // try to prune out extras
        if (episodes.length > 1) {
          const pruned = episodes.filter(episode => episode.name.match(/extra/gi));
          if (pruned.length > 0) {
            episodes = pruned;
          }
        }

        torrent.episodes = episodes.length > 0 ? episodes : undefined;
        return torrent;
      })
      .catch(err => {
        console.log(`failed opening: ${torrent.name}:${torrent.seeders}`);
        return torrent;
      });
}

/*
 * Construct series info based on imdb_id
 */
async function seriesInformation(args) {
  try {
    const idInfo = args.id.split(':');
    const imdbId = idInfo[0];
    const season = parseInt(idInfo[1]);
    const episode = parseInt(idInfo[2]);
    const seasonString = season < 10 ? `0${season}` : `${season}`;
    const episodeString = episode < 10 ? `0${episode}` : `${episode}`;

    const metadata = await getMetadata(imdbId, args.type);
    const seriesTitle = escapeTitle(metadata.title);

    return {
      imdb: imdbId,
      seriesTitle: seriesTitle,
      episodeTitle: `${seriesTitle} s${seasonString}e${episodeString}`,
      season: season,
      episode: episode
    };
  } catch (e) {
    return new Error(e.message);
  }
}

/*
 * Construct movie info based on imdb_id
 */
async function movieInformation(args) {
  return getMetadata(args.id, args.type)
      .then(metadata => {
        return {
          title: escapeTitle(metadata.title),
          year: metadata.year
        };
      });
}

const url = process.env.ENDPOINT
    ? process.env.ENDPOINT + "/manifest.json"
    : "https://localhost:7000/manifest.json";
addon.runHTTPWithOptions({port: process.env.PORT || 7000});
addon.publishToWeb(url);
addon.publishToCentral(url);