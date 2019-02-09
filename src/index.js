const addonSDK = require('stremio-addon-sdk');
const magnet = require('magnet-uri');
const videoExtensions = require('video-extensions');
const _ = require('lodash');
const {torrentSearch, torrentFiles} = require('./torrent');
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
    const seriesInfo = await seriesInformation(args);

    Promise.all([
      torrentSearch(seriesInfo.imdb)
      .then(torrents => filterSeriesTitles(torrents, seriesInfo, true)),
      torrentSearch(seriesInfo.seriesTitle)
      .then(torrents => filterSeriesTitles(torrents, seriesInfo)),
      torrentSearch(seriesInfo.episodeTitle)
      .then(torrents => filterSeriesTitles(torrents, seriesInfo))
    ]).then(results => {
      const torrents = _.uniqBy(_.flatten(results), 'magnetLink')
      .filter(torrent => torrent.seeders > 0)
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, 5);

      Promise.all(torrents.map(async torrent => await openFiles(torrent)))
      .then(torrents => {
        console.log('opened torrents: ', torrents.map(torrent => torrent.name));

        const streams = torrents
        .filter(torrent => torrent.files)
        .map(torrent => findEpisode(torrent, seriesInfo))
        .filter(torrent => torrent.episodes)
        .map(torrent => torrent.episodes.map(episode => {
          const {infoHash} = magnet.decode(torrent.magnetLink);
          const availability = torrent.seeders < 5 ? 1 : 2;
          const title = `${torrent.name.replace(/,/g, ' ')}\n${episode.name}\n👤 ${torrent.seeders}`;

          return {
            infoHash: infoHash,
            fileIdx: episode.index,
            name: 'TPB',
            title: title,
            availability: availability
          };
        }))
        .reduce((a, b) => a.concat(b), [])
        .filter(stream => stream.infoHash);
        console.log('streams: ', streams.map(stream => stream.title));
        return callback(null, {streams: streams});
      }).catch((error) => {
        console.log(error);
        return callback(new Error(error.message))
      });
    }).catch((error) => {
      console.log(error);
      return callback(new Error(error.message))
    });
  } else {
    try {
      const results = await Promise.all([
        torrentSearch(args.id),
        movieInformation(args)
        .then(movieInfo => torrentSearch(movieInfo.title)
        .then(torrents => filterMovieTitles(torrents, movieInfo)))
      ]);
      const streams = _.uniqBy(_.flatten(results), 'magnetLink')
      .filter(torrent => torrent.seeders > 0)
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, 4)
      .map(torrent => {
        const {infoHash} = magnet.decode(torrent.magnetLink);
        const availability = torrent.seeders < 5 ? 1 : 2;
        const detail = `${torrent.name}\n👤 ${torrent.seeders}`;
        return {
          infoHash,
          name: 'TPB',
          title: detail,
          availability
        };
      });

      return callback(null, {streams: streams});
    } catch (error) {
      return callback(new Error(error.message))
    }
  }
});

/*
 * Reads torrent files and tries to find a matched series episode.
 */
const findEpisode = (torrent, seriesInfo) => {
  try {
    const episodes = torrent.files
    .map((file, fileId) => {
      return {
        name: file.name,
        index: fileId,
        size: file.length
      }
    })
    .filter(file => videoExtensions.includes(file.name.split('.').pop()));
    torrent.episodes = filterSeriesEpisodes(episodes, seriesInfo.season, seriesInfo.episode);

    // try to prune out extras
    if (torrent.episodes.length > 1) {
      const pruned = torrent.episodes
      .filter(episode => episode.name.match(/extra/gi));
      if (pruned.length > 0) {
        torrent.episodes = pruned;
      }
    }

    return torrent;
  } catch (e) {
    console.log(e);
    return torrent;
  }
};

/*
 * Append torrent files to the object.
 */
const openFiles = torrent => {
  return torrentFiles(torrent.magnetLink)
  .then(files => {
    torrent.files = files;
    return torrent;
  })
  .catch(err => {
    console.log(`failed opening: ${torrent.name}:${torrent.seeders}`);
    return torrent;
  });
};

/*
 * Construct series info based on imdb_id
 */
const seriesInformation = async args => {
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
      imdb: idInfo[0],
      seriesTitle: seriesTitle,
      episodeTitle: `${seriesTitle} s${seasonString}e${episodeString}`,
      season: season,
      episode: episode
    };
  } catch (e) {
    return new Error(e.message);
  }
};

/*
 * Construct movie info based on imdb_id
 */
const movieInformation = async args => {
  try {
    const data = await getMetadata(args.id, args.type);
    return {
      title: escapeTitle(data.title),
      year: data.year
    };
  } catch (e) {
    return new Error(e.message);
  }
};

const url = process.env.ENDPOINT
    ? process.env.ENDPOINT + "/manifest.json"
    : "https://localhost:7000/manifest.json";
addon.runHTTPWithOptions({port: process.env.PORT || 7000});
addon.publishToWeb(url);
addon.publishToCentral(url);