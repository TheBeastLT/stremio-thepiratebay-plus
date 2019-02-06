const addonSDK = require('stremio-addon-sdk');
const magnet = require('magnet-uri');
const videoExtensions = require('video-extensions');
const _ = require('lodash');
const {
	imdbIdToName,
	torrentStreamEngine,
	ptbSearch
} = require('./tools');

const addon = new addonSDK({
	id: 'com.stremio.thepiratebay.plus',
	version: '1.0.0',
	name: 'ThePirateBay+',
	description: 'Search for movies and series from ThePirateBay',
	catalogs: [],
	resources: ['stream'],
	types: ['movie', 'series'],
	idPrefixes: ['tt'],
	background:'http://wallpapercraze.com/images/wallpapers/thepiratebay-77708.jpeg',
	logo: 'https://cdn.freebiesupply.com/logos/large/2x/the-pirate-bay-logo-png-transparent.png',
	contactEmail: 'pauliox@beyond.lt'
});

addon.defineStreamHandler(async function(args, callback) {
	if (args.type === 'series') {
		const seriesInfo = await seriesInformation(args);
		console.log(seriesInfo.episodeTitle);

		Promise.all([
			ptbSearch(seriesInfo.imdb),
			ptbSearch(seriesInfo.seriesTitle),
			ptbSearch(seriesInfo.episodeTitle)
		]).then(results => {
			const torrents = _.uniqBy(_.flatten(results), 'magnetLink')
			.filter(torrent => torrent.seeders > 0)
			.filter(torrent => seriesInfo.matches(escapeTitle(torrent.name)))
			.sort((a, b) => b.seeders - a.seeders)
			.slice(0, 5);

			Promise.all(torrents.map(async torrent => await openFiles(torrent)))
			.then(torrents => {
				console.log('opened torrents: ', torrents.map(torrent => torrent.name));

				const streams = torrents
				.filter(torrent => torrent.files)
				.map(torrent => findEpisode(torrent, seriesInfo))
				.filter(torrent => torrent.episode)
				.map(torrent => {
					const { infoHash } = magnet.decode(torrent.magnetLink);
					const availability = torrent.seeders < 5 ? 1 : 2;
					const title = `${torrent.name.replace(/,/g, ' ')}\n${torrent.episode.fileName}\n👤 ${torrent.seeders}`;

					return {
						infoHash: infoHash,
						fileIdx: torrent.episode.fileId,
						name: 'TPB',
						title: title,
						availability: availability
					};
				})
				.filter(stream => stream.infoHash);
				console.log('streams: ', streams.map(stream => stream.title));
				return callback(null, { streams: streams });
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
				movieTitle(args.id).then(title => ptbSearch(title))
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

			return callback(null, { streams: streams });
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
		torrent.episode = torrent.files
			.map((file, fileId) => {
				return {
					fileName: file.name,
					fileId: fileId,
					fileSize: file.length
				}
			})
			.filter(file => videoExtensions.indexOf(file.fileName.split('.').pop()) !== -1)
			.sort((a, b) => b.fileSize - a.fileSize)
			.find(file => seriesInfo.matchesEpisode(escapeTitle(file.fileName)));
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
		const seriesTitle = await movieTitle(idInfo[0]);

		const seasonNum = parseInt(idInfo[1]);
		const episodeNum = parseInt(idInfo[2]);

		const season = seasonNum < 10 ? `0${seasonNum}` : `${seasonNum}`;
		const episode = episodeNum < 10 ? `0${episodeNum}` : `${episodeNum}`;

		const seriesInfo = {
			imdb: idInfo[0],
			seriesTitle: seriesTitle,
			episodeTitle:`${seriesTitle} s${season}e${episode}`,
			nameMatcher: new RegExp(
				`^\\b${seriesTitle}\\b.*` + // match series title followed by any characters
					`(` + // start capturing second condition
						// first variation
						`\\bseasons?\\b[^a-zA-Z]*` + // contains 'season'/'seasons' followed by non-alphabetic characters
							`(` + // start capturing sub condition
								`\\bs?0?${seasonNum}\\b` + // followed by season number ex:'4'/'04'/'s04'/'1,2,3,4'/'1 2 3 4'
								`|\\b[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\b[01]?\\d\\b` + // or followed by season range '1-4'/'01-04'/'1-12'
							`)` + // finish capturing subcondition
						// second variation
						`|\\bs${season}\\b` + // or constrains only season identifier 's04'/'s12'
						// third variation
						`|\\bs[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\bs[01]?\\d\\b` + // or contains season range 's01 - s04'/'s01.-.s04'/'s1-s12'
						// fourth variation
						`|((\\bcomplete|all|full\\b).*(\\bseries|seasons|collection\\b))` + // or contains any two word variation from (complete,all,full)+(series,seasons)
					`)` // finish capturing second condition
			, 'i'), // case insensitive matcher
			episodeMatcher: new RegExp(
					`\\bs?0?${seasonNum}[^0-9]*${episode}\\b`// match episode naming cases S01E01/1x01/S1.EP01..
					, 'i'), // case insensitive matcher
		};
		seriesInfo.matchesName = title => seriesInfo.nameMatcher.test(title);
		seriesInfo.matchesEpisode = title => seriesInfo.episodeMatcher.test(title);
		seriesInfo.matches = title => seriesInfo.matchesName(title) || seriesInfo.matchesEpisode(title);
		return seriesInfo;
	} catch (e) {
		return new Error(e.message);
	}
};

const movieTitle = async imdbId => {
	try {
		const data = await imdbIdToName(imdbId);
		return escapeTitle(data.title);
	} catch (e) {
		return new Error(e.message);
	}
};

const escapeTitle = title => {
	return title.toLowerCase()
		.normalize('NFKD') // normalize non-ASCII characters
		.replace(/[\u0300-\u036F]/g, '')
		.replace(/[._]+/g, ' ') // replace dots or underscores with spaces
		.replace(/[^\w- ]/gi, ''); // remove all non-alphanumeric chars
};


const url = process.env.ENDPOINT ? process.env.ENDPOINT + "/manifest.json" : "https://localhost:7000/manifest.json";
addon.runHTTPWithOptions({ port: process.env.PORT || 7000 });
addon.publishToWeb(url);
addon.publishToCentral(url);