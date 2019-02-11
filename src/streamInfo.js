const magnet = require('magnet-uri');
const titleParser = require('parse-torrent-title');

function movieStream(torrent) {
  const { infoHash } = magnet.decode(torrent.magnetLink);
  const titleInfo = titleParser.parse(torrent.name);
  const title = joinDetailParts(
      [
        joinDetailParts([titleInfo.title, titleInfo.year, titleInfo.language]),
        joinDetailParts([titleInfo.resolution, titleInfo.source], '📺 '),
        joinDetailParts([torrent.seeders], '👤 ')
      ],
      '',
      '\n'
  );

  return {
    name: 'TPB',
    title: title,
    infoHash: infoHash,
    tag: titleInfo.resolution
  };
}

function seriesStream(torrent, episode) {
  const { infoHash } = magnet.decode(torrent.magnetLink);
  const tInfo = titleParser.parse(torrent.name);
  const eInfo = titleParser.parse(episode.name);
  const sameInfo = tInfo.season === eInfo.season && tInfo.episode === eInfo.episode;
  const title = joinDetailParts(
      [
        joinDetailParts([torrent.name.replace(/[, ]+/, ' ')]),
        joinDetailParts([!sameInfo && episode.name]),
        joinDetailParts([tInfo.resolution || eInfo.resolution, tInfo.source || eInfo.source], '📺 '),
        joinDetailParts([torrent.seeders], '👤 ')
      ],
      '',
      '\n'
  );

  return {
    name: 'TPB',
    title: title,
    infoHash: infoHash,
    fileIdx: episode && episode.index,
    tag: tInfo.resolution || eInfo.resolution
  };
}

function joinDetailParts(parts, prefix = '', delimiter = ' ') {
  const filtered = parts.filter((part) => part).join(delimiter);

  return filtered.length > 0 ? `${prefix}${filtered}` : null;
}

module.exports = { movieStream, seriesStream };
