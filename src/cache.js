const cacheManager = require('cache-manager');
const mangodbStore = require('cache-manager-mongodb');

const GLOBAL_KEY_PREFIX = 'stremio-tpb';
const TORRENT_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|torrent`;
const STREAM_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|stream`;
const METADATA_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|metadata`;

const TORRENT_TTL = process.env.TORRENT_TTL || 6 * 60 * 60; // 6 hours
const STREAM_TTL = process.env.STREAM_TTL || 6 * 60 * 60; // 6 hours
const METADATA_TTL = process.env.METADATA_TTL || 2 * 24 * 60 * 60; // 2 days

const MONGO_URI = process.env.MONGODB_URI;
const NO_CACHE = process.env.NO_CACHE || false;

const cache = initiateCache();

function initiateCache() {
  if (NO_CACHE) {
    return null;
  } else if (MONGO_URI) {
    return cacheManager.caching({
      store: mangodbStore,
      uri: MONGO_URI,
      options: {
        collection: 'cacheManager',
        ttl: TORRENT_TTL
      },
      ttl: TORRENT_TTL,
      ignoreCacheErrors: true
    });
  } else {
    return cacheManager.caching({
      store: 'memory',
      ttl: TORRENT_TTL
    });
  }
}

function cacheWrap(key, method, options) {
  if (NO_CACHE || !cache) {
    return method();
  }
  return cache.wrap(key, method, options);
}

function cacheWrapTorrent(id, method) {
  return cacheWrap(`${TORRENT_KEY_PREFIX}:${id}`, method, { ttl: TORRENT_TTL });
}

function cacheWrapStream(id, method) {
  return cacheWrap(`${STREAM_KEY_PREFIX}:${id}`, method, { ttl: STREAM_TTL });
}

function cacheWrapMetadata(id, method) {
  return cacheWrap(`${METADATA_KEY_PREFIX}:${id}`, method, { ttl: METADATA_TTL });
}

module.exports = { cacheWrapTorrent, cacheWrapStream, cacheWrapMetadata };

