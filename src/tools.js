const imdb = require('imdb');
const torrentStream = require('torrent-stream');
const pirata = require("./pirata.js");

const cache = {};
const imdbIdToName = imdbId => {
	if (cache[imdbId]) {
		return cache[imdbId];
	}
	return new Promise(function (resolve, rejected) {
		imdb(imdbId, function(err, data) {
			if(err){
				rejected(new Error("failed imdb mapping"));
			} else {
				cache[imdbId] = {
					title: data.title,
					year: data.year
				};
				resolve(cache[imdbId]);
			}
		});
	});
};

const torrentStreamEngine = magnetLink => {
	return new Promise(function (resolve, rejected) {
		const engine = new torrentStream(magnetLink, {
			connections: 30
		});
		engine.ready(() => {
			const files = engine.files;
			engine.destroy();
			resolve(files);
		});
		setTimeout(() => {
			engine.destroy();
			rejected(new Error("No available connections for torrent!"));
		}, 3000);
	});
};

const proxyList = process.env.PROXIES
		? process.env.PROXIES.split(",")
		: ['https://pirateproxy.sh', 'https://pirateproxy.gdn'];
const ptbSearch = async (query, retries = 0) => {
	if (retries > 2) {
		console.log(`failed \"${query}\" query.`);
		return [];
	}
	return pirata.search(
			query.substring(0, 60),
			{
				proxyList: proxyList,
				timeout: 3000,
				cat: pirata.categories.Video
			}
	)
	.then(results => {
		console.log(`pirata: ${query}=${results.length}`);
		return results;
	})
	.catch(err => {
		console.log(`retrying \"${query}\" query...`);
		return ptbSearch(query, retries + 1);
	});
};

module.exports = {
	imdbIdToName,
	torrentStreamEngine,
	ptbSearch
};