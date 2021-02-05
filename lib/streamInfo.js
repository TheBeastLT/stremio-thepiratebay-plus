const titleParser = require('parse-torrent-title');

const SHORT_NAME = 'TPB+';

function movieStream(torrent) {
  const titleInfo = titleParser.parse(torrent.name);
  const title = joinDetailParts(
      [
        joinDetailParts([torrent.name.replace(/[, ]+/g, ' ')]),
        joinDetailParts([titleInfo.resolution, titleInfo.source], '📺 '),
        joinDetailParts([torrent.seeders], '👤 ')
      ],
      '',
      '\n'
  );

  return {
    name: SHORT_NAME,
    title: title,
    infoHash: torrent.infoHash,
    tag: titleInfo.resolution
  };
}

function seriesStream(torrent, episode) {
  const tInfo = titleParser.parse(torrent.name);
  const eInfo = titleParser.parse(episode.name);
  const sameInfo = tInfo.season === eInfo.season && tInfo.episode && eInfo.episode === tInfo.episode;
  const resolution = tInfo.resolution || eInfo.resolution;
  const quality = tInfo.source || eInfo.source;
  const title = joinDetailParts(
      [
        joinDetailParts([torrent.name.replace(/[, ]+/g, ' ')]),
        joinDetailParts([!sameInfo && episode.name.replace(/[, ]+/g, ' ')]),
        joinDetailParts([resolution, quality], '📺 '),
        joinDetailParts([torrent.seeders], '👤 ')
      ],
      '',
      '\n'
  );

  return {
    name: SHORT_NAME,
    title: title,
    infoHash: torrent.infoHash,
    fileIdx: episode && episode.index,
    tag: tInfo.resolution || eInfo.resolution,
    behaviorHints: {
      bingeGroup: sameInfo ?
        `tpb+|${resolution || quality}|${eInfo.group}` :
        `tpb+|${torrent.infoHash}`
    }
  };
}

function joinDetailParts(parts, prefix = '', delimiter = ' ') {
  const filtered = parts.filter((part) => part).join(delimiter);

  return filtered.length > 0 ? `${prefix}${filtered}` : null;
}

module.exports = { movieStream, seriesStream };
