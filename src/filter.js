function filterSeriesTitles(torrents, seriesInfo, seasonInfoOnly = false) {
  const seriesNameRegex = seasonInfoOnly ? '' : seriesInfo.seriesTitle.split(' ').join('[ -]+');
  const seasonRegex = seriesInfo.season < 10 ? `0?${seriesInfo.season}` : `${seriesInfo.season}`;
  const episodeRegex = seriesInfo.episode < 10 ? `0?${seriesInfo.episode}` : `${seriesInfo.episode}`;
  const nameRegex = new RegExp(
      `\\b${seriesNameRegex}\\b.*` + // match series title followed by any characters
      `(` + // start capturing second condition
      // first variation
      `\\bseasons?\\b[^a-zA-Z]*` + // contains 'season'/'seasons' followed by non-alphabetic characters
      `(` + // start capturing sub condition
      `\\bs?${seasonRegex}\\b` + // followed by season number ex:'4'/'04'/'s04'/'1,2,3,4'/'1 2 3 4'
      `|\\b[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\b[01]?\\d\\b` + // or followed by season range '1-4'/'01-04'/'1-12'
      `)` + // finish capturing subcondition
      // second variation
      `|\\bs${seasonRegex}\\b(?!\\W*[ex]p?\\W*\\d{1,2})` + // or constrains only season identifier 's04'/'s12'
      // third variation
      `|\\bs[01]?\\d\\b[^a-zA-Z]*-[^a-zA-Z]*\\bs[01]?\\d\\b` + // or contains season range 's01 - s04'/'s01.-.s04'/'s1-s12'
      // fourth variation
      `|((\\bcomplete|all|full|mini|collection\\b).*(\\bseries|seasons|collection\\b))` + // or contains any two word variation
      `|\\bs?${seasonRegex}\\W*[ex]p?\\W*${episodeRegex}\\b` + // or matches episode info
      `)`, // finish capturing second condition
      'i');

  return torrents.filter(torrent => seriesInfo.seriesTitle.length > 50 // tpb title is limited to 60 symbols and may truncate season info
      ? seriesInfo.seriesTitle.includes(escapeTitle(torrent.name, false))
      : nameRegex.test(escapeTitle(torrent.name, false)));
}

function filterSeriesEpisodes(files, season, episode) {
  const seasonRegex = season ? season < 10 ? `0?${season}` : `${season}` : `\\d{1,2}`;
  const episodeRegex = episode ? episode < 10 ? `0${episode}` : `${episode}` : `\\d{2}`;
  const fileNameRegex = new RegExp( // match episode naming cases S01E01/1x01/S1.EP01/S01E01-E02..
      `\\bs?${seasonRegex}(?:\\s?(?:[ex-]|ep|episode|[ex]p?\\s?\\d{2}(?!\\d))\\s?)+${episodeRegex}(?!\\d)`,
      'i');

  return files.filter(file => fileNameRegex.test(escapeTitle(file.name)));
}

function filterMovieTitles(torrents, movieInfo) {
  const movieRegex = new RegExp(`\\b${movieInfo.title}\\b.*\\b${movieInfo.year}\\b`);

  return torrents.filter(torrent => movieRegex.test(escapeTitle(torrent.name)));
}

function escapeTitle(title, hyphenEscape = true) {
  return title.toLowerCase()
      .normalize('NFKD') // normalize non-ASCII characters
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/&/g, 'and')
      .replace(hyphenEscape ? /[.,_+ -]+/g : /[.,_+ ]+/g, ' ') // replace dots, commas or underscores with spaces
      .replace(/[^\w- ]/gi, '') // remove all non-alphanumeric chars
      .trim();
}

module.exports = {
  escapeTitle,
  filterMovieTitles,
  filterSeriesTitles,
  filterSeriesEpisodes
};