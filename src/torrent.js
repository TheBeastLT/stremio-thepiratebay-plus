const torrentStream = require('torrent-stream');
const pirata = require("./pirata.js");

module.exports.torrentFiles = magnetLink => {
  return new Promise(function (resolve, rejected) {
    const engine = new torrentStream(magnetLink);
    engine.ready(() => {
      const files = engine.files
          .map((file, fileId) => {
            return {
              name: file.name,
              index: fileId,
              size: file.length
            }
          });
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
    : ['https://pirateproxy.sh'];
module.exports.torrentSearch = (query, page = 0) => {
  return pirata.search(
      query && query.substring(0, 60),
      {
        proxyList: proxyList,
        timeout: 3000,
        cat: pirata.categories.Video,
        page: page
      }
  )
      .then(results => {
        console.log(`pirata: ${query}=${results.length}`);
        return results;
      })
      .catch(err => {
        console.log(`failed \"${query}\" query.`);
        return [];
      });
};