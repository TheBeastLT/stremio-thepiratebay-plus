const addonSDK = require('stremio-addon-sdk');
const magnet = require('magnet-uri');
const videoExtensions = require('video-extensions');
const _ = require('lodash');
const {torrentStreamEngine, ptbSearch} = require('./tools');
const {getMetadata} = require('./metadata');

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
      ptbSearch(seriesInfo.imdb),
      ptbSearch(seriesInfo.seriesTitle),
      ptbSearch(seriesInfo.episodeTitle)
    ]).then(results => {
      const torrents = _.uniqBy(_.flatten(results), 'magnetLink')
      .filter(torrent => torrent.seeders > 0)
      .filter(torrent => {
        const name = results[0].includes(torrent)
            ? `${seriesInfo.seriesTitle} ${torrent.name}` // for imdbId results we only care about the season info
            : torrent.name;
        return seriesInfo.matchesName(escapeTitle(name, false))
      })
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
          const title = `${torrent.name.replace(/,/g, ' ')}\n${episode.fileName}\n👤 ${torrent.seeders}`;

          return {
            infoHash: infoHash,
            fileIdx: episode.fileId,
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
        ptbSearch(args.id),
        movieInformation(args)
        .then(movieInfo => ptbSearch(movieInfo.title)
        .then(results => results
        .filter(torrent => movieInfo.matchesName(escapeTitle(torrent.name)))))
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
    torrent.episodes = torrent.files
    .map((file, fileId) => {
      return {
        fileName: file.name,
        fileId: fileId,
        fileSize: file.length
      }
    })
    .filter(file => videoExtensions.includes(file.fileName.split('.').pop()))
    .sort((a, b) => b.fileSize - a.fileSize)
    .filter(file => seriesInfo.matchesEpisode(escapeTitle(file.fileName)));

    // try to prune out extras
    if (torrent.episodes.length > 1) {
      const pruned = torrent.episodes
      .filter(episode => episode.fileName.match(/extra/gi));
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
const openFiles = async torrent => {
  try {
    torrent.files = await torrentStreamEngine(torrent.magnetLink);
    return torrent;
  } catch (e) {
    console.log("failed opening:", torrent.name);
    return torrent;
  }
};

/*
 * Construct series info based on imdb_id
 */
const seriesInformation = async args => {
  try {
    const idInfo = args.id.split(':');
    const data = await getMetadata(idInfo[0], args.type);
    const seriesTitle = escapeTitle(data.title);

    const seasonNum = parseInt(idInfo[1]);
    const episodeNum = parseInt(idInfo[2]);

    const season = seasonNum < 10 ? `0${seasonNum}` : `${seasonNum}`;
    const episode = episodeNum < 10 ? `0${episodeNum}` : `${episodeNum}`;

    const seriesInfo = {
      imdb: idInfo[0],
      seriesTitle: seriesTitle,
      episodeTitle: `${seriesTitle} s${season}e${episode}`,
      nameMatcher: new RegExp(
          `\\b${seriesTitle.split(' ').join('[ -]+')}\\b.*` + // match series title followed by any characters
          `(` + // start capturing second condition
          // first variation
          `\\bseasons?\\b[^a-zA-Z]*` + // contains 'season'/'seasons' followed by non-alphabetic characters
          `(` + // start capturing sub condition
          `\\bs?0?${seasonNum}\\b` + // followed by season number ex:'4'/'04'/'s04'/'1,2,3,4'/'1 2 3 4'
          `|\\b[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\b[01]?\\d\\b` + // or followed by season range '1-4'/'01-04'/'1-12'
          `)` + // finish capturing subcondition
          // second variation
          `|\\bs${season}\\b(?!\\W*[ex]p?\\W*\\d{1,2})` + // or constrains only season identifier 's04'/'s12'
          // third variation
          `|\\bs[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\bs[01]?\\d\\b` + // or contains season range 's01 - s04'/'s01.-.s04'/'s1-s12'
          // fourth variation
          `|((\\bcomplete|all|full|mini|collection\\b).*(\\bseries|seasons|collection\\b))`
          + // or contains any two word variation
          `|\\bs?${season}\\W*[ex]p?\\W*${episode}\\b` + // or matches episode info
          `)` // finish capturing second condition
          , 'i'), // case insensitive matcher
      episodeMatcher: new RegExp(
          `\\bs?0?${seasonNum}(?:\\s?(?:[ex-]|ep|episode|[ex]p?\\s?\\d{1,2}(?!\\d))\\s?)+0?${episode}(?!\\d)`// match episode naming cases S01E01/1x01/S1.EP01..
          , 'i'), // case insensitive matcher
    };
    seriesInfo.matchesName = title => seriesTitle.length > 50
        ? seriesTitle.includes(title)
        : seriesInfo.nameMatcher.test(title);
    seriesInfo.matchesEpisode = title => seriesInfo.episodeMatcher.test(title);
    return seriesInfo;
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
    const movieInfo = {
      title: escapeTitle(data.title),
      year: data.year
    };
    movieInfo.matchesName = title => title.includes(movieInfo.title)
        && title.includes(movieInfo.year);
    return movieInfo;
  } catch (e) {
    return new Error(e.message);
  }
};

const escapeTitle = (title, hyphenEscape = true) => {
  return title.toLowerCase()
  .normalize('NFKD') // normalize non-ASCII characters
  .replace(/[\u0300-\u036F]/g, '')
  .replace(/&/g, 'and')
  .replace(hyphenEscape ? /[.,_+ -]+/g : /[.,_+ ]+/g, ' ') // replace dots, commas or underscores with spaces
  .replace(/[^\w- ]/gi, '') // remove all non-alphanumeric chars
  .trim();
};

const url = process.env.ENDPOINT
    ? process.env.ENDPOINT + "/manifest.json"
    : "https://localhost:7000/manifest.json";
addon.runHTTPWithOptions({port: process.env.PORT || 7000});
addon.publishToWeb(url);
addon.publishToCentral(url);