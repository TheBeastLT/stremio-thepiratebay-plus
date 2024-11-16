const { Keyv } = require('keyv');
const { KeyvMongo } = require('@keyv/mongo');
const { createCache } = require('cache-manager');

const GLOBAL_KEY_PREFIX = 'stremio-tpb';
const TORRENT_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|torrent`;
const TORRENT_FILES_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|files`;
const STREAM_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|stream`;
const METADATA_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|metadata`;

const METADATA_TTL = process.env.METADATA_TTL || 7 * 24 * 60 * 60; // 7 days
const TORRENT_TTL = process.env.TORRENT_TTL || 72 * 60 * 60; // 72 hours
const TORRENT_FILES_TTL = process.env.TORRENT_FILES_TTL || 30 * 24 * 60 * 60; // 30 days
const STREAM_TTL = process.env.STREAM_TTL || 48 * 60 * 60; // 48 hours
const STREAM_EMPTY_TTL = process.env.STREAM_EMPTY_TTL || 30 * 60; // 30 minutes
// When the streams are empty we want to cache it for less time in case of timeouts or failures

const MONGO_URI = process.env.MONGODB_URI;

const cache = initiateCache();

function initiateCache() {
  const store = MONGO_URI
    ? new Keyv(new KeyvMongo(MONGO_URI, { collection: 'tpb-addon-collection', socketTimeoutMS: 30000 }))
    : new Keyv()
  return createCache({ stores: [store] });
}

function cacheWrap(key, method, ttl) {
  if (!cache) {
    return method();
  }
  return cache.wrap(key, method, ttl);
}

function cacheWrapMetadata(id, method) {
  return cacheWrap(`${METADATA_KEY_PREFIX}:${id}`, method, METADATA_TTL);
}

function cacheWrapTorrent(id, method) {
  return cacheWrap(`${TORRENT_KEY_PREFIX}:${id}`, method, TORRENT_TTL);
}

function cacheWrapTorrentFiles(id, method) {
  return cacheWrap(`${TORRENT_FILES_KEY_PREFIX}:${id}`, method, TORRENT_FILES_TTL);
}

function cacheWrapStream(id, method) {
  const ttl = (streams) => streams.length ? STREAM_TTL : STREAM_EMPTY_TTL
  return cacheWrap(`${STREAM_KEY_PREFIX}:${id}`, method, ttl);
}

function updateMetadata(id, updateFunction) {
  if (cache) {
    const key = `${METADATA_KEY_PREFIX}:${id}`;
    return cache.get(key)
        .then((metadata) => updateFunction(metadata))
        .then((metadata) => cache.set(key, metadata, METADATA_TTL));
  }
}

module.exports = { cacheWrapTorrent, cacheWrapTorrentFiles, cacheWrapStream, cacheWrapMetadata, updateMetadata };

