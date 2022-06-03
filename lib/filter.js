const parseTitle = require('parse-torrent-title');

function escapeTitle(title, hyphenEscape = true) {
  return title.toLowerCase()
      .normalize('NFKD') // normalize non-ASCII characters
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/&/g, 'and')
      .replace(hyphenEscape ? /[.,_+ -]+/g : /[.,_+ ]+/g, ' ') // replace dots, commas or underscores with spaces
      .replace(/[^\w- ()]/gi, '') // remove all non-alphanumeric chars
      .trim();
}

function mostCommonTitle(torrents) {
  return torrents
      .map((torrent) => parseTitle.parse(torrent.name))
      .map((properties) => escapeTitle(properties.title))
      .reduce((a, b, i, arr)=> arr.filter((v) => v === a).length >= arr.filter((v) => v === b).length ? a : b, null);
}

function canContainEpisode(torrent, seriesInfo, seasonInfoOnly = false) {
  if (seriesInfo.title.length > 50) {
    // tpb title is limited to 60 symbols and may truncate season info
    return seriesInfo.title.includes(escapeTitle(torrent.name));
  }

  const titleRegex = new RegExp(`(?:^|\\()(?:${seriesInfo.title}|${seriesInfo.communityTitle})`, 'i');
  const titleInfo = parseTitle.parse(torrent.name);
  const matchesTitle = seasonInfoOnly || titleRegex.test(escapeTitle(titleInfo.title));
  const matchesSeason = titleInfo.seasons
    && titleInfo.seasons.includes(seriesInfo.season)
    || (!titleInfo.seasons && !!titleInfo.episodes);
  const matchesEpisode = !titleInfo.episodes
    || titleInfo.episodes.includes(seriesInfo.episode)
    || titleInfo.episodes.includes(seriesInfo.absoluteEpisode);

  // console.log(`title=${torrent.name}; season=${titleInfo.seasons}; episode=${titleInfo.episodes}`);

  return matchesTitle && (matchesEpisode && matchesSeason || titleInfo.complete);
}

function containSingleEpisode(torrent, seriesInfo) {
  const titleInfo = parseTitle.parse(torrent.name);

  return titleInfo.season === seriesInfo.season && titleInfo.episode === seriesInfo.episode;
}

function isCorrectEpisode(torrent, file, seriesInfo) {
  const titleInfo = parseTitle.parse(file.name);
  let pathSeason = null;
  const season = titleInfo.season;
  const episodes = titleInfo.episodes;

  // the episode may be in a folder containing season number
  if (!season && episodes && (episodes.includes(seriesInfo.episode) || episodes.includes(seriesInfo.absoluteEpisode))) {
    const folders = file.path.split('/');
    const pathInfo = parseTitle.parse(folders[folders.length - 2] || torrent.name);
    pathSeason = pathInfo.season;
  }

  // console.log(`title=${file.path}; season=${season || pathSeason}; episode=${titleInfo.episodes}`);

  if (!episodes) {
    return false;
  } else if ((season || pathSeason) === seriesInfo.season && episodes.includes(seriesInfo.episode)) {
    file.season = season || pathSeason;
    file.episode = seriesInfo.episode;
    return true;
  } else if (episodes.includes(seriesInfo.absoluteEpisode)
    && ((!season && !pathSeason || pathSeason === seriesInfo.season)
    || seriesInfo.absoluteEpisode > seriesInfo.episodesInSeason)) {
    file.season = pathSeason;
    file.episode = seriesInfo.absoluteEpisode;
    return true;
  } else if (seriesInfo.episode < 100 && seriesInfo.season > 0 && episodes.includes(seriesInfo.season * 100 + seriesInfo.episode)) {
    file.season = season;
    file.episode = seriesInfo.season * 100 + seriesInfo.episode;
    return true;
  }
  return false;
}

// prune out files not containing episode number in them
// so that we dont explode them to properties unnecessarily later on.
function onlyPossibleEpisodes(files, season, episode, absoluteEpisode) {
  const episodeRegex = (`@${episode}`).slice(-2).replace(/@/g, '0?');
  const absoluteEpisodeRegex = (`@@${absoluteEpisode}`).slice(-3).replace(/@/g, '0?');
  const seasonEpisodeRegex = `${season * 100 + episode}`;
  const fullRegex = new RegExp(`(?:\\D|^)(${episodeRegex}|${absoluteEpisodeRegex}|${seasonEpisodeRegex})\\D`);

  return files.filter((file) => fullRegex.test(file.name));
}

function filterMovieTitles(torrents, movieInfo) {
  const movieRegex = new RegExp(`\\b${movieInfo.title}\\b.*\\b${movieInfo.year}\\b`);

  return torrents.filter((torrent) => movieRegex.test(escapeTitle(torrent.name)));
}

module.exports = {
  escapeTitle,
  mostCommonTitle,
  filterMovieTitles,
  canContainEpisode,
  onlyPossibleEpisodes,
  containSingleEpisode,
  isCorrectEpisode
};
