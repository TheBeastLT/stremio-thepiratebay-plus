# ThePirateBay+ Stremio addon
Fetch movies and series from ThePirateBay.
Inspired by [ThanosDi/piratebay-stremio-addon](https://github.com/ThanosDi/piratebay-stremio-addon)

## Install
``npm  install``

## Run
``npm start``

## Configuration

Available environment parameters to configure:

#### General

 - `ENDPOINT` - production endpoint of the addon; **default** \"https://localhost:7000/manifest.json\"
 - `PORT` - port used for the server; **default** 7000
 - `CINEMETA_URL` - Cinemeta metadata addon url; **default** \"https://v3-cinemeta.strem.io\"

#### Rate limiting

 - `LIMIT_MAX_CONCURRENT` - max amount of requests running concurrently; **default** 5
 - `LIMIT_QUEUE_SIZE` - queue size for requests not able to run. When queue is full new requests are dropped; **default** 30
 
#### Torrent search

 - `PROXIES` - ThePirateBay proxy list separated by `,`. Use proxies, which allow searching by `imdbId` for best results; **default** \"https://pirateproxy.sh\"
 - `MIN_SEEDS_TO_EXTEND` - minimum numbers of seeders the last torrent in the page has to have to extend the search to next page. Only applicable to series search; **default** 20
 - `MAX_PAGES_TO_EXTEND` - maximum numbers of pages the extending will go on. Set '0' to search only first page; **default** 2
 
#### Cache

 - `MONGO_URI` - mongoDB URI used for the cache. If no URI is specified a in memory cache will be used; **default** null
 - `NO_CACHE` - flag indicating whether to disable the cache or not; **default** false
 - `METADATA_TTL` - time in seconds how long the title metadata will be cached; **default** 2 * 24 * 60 * 60 // 2 days
 - `TORRENT_TTL` - time in seconds how long torrent search results will be cached. Applicable to series torrent results; **default** 6 * 60 * 60; // 6 hours
 - `STREAM_TTL` - time in seconds how long the processed streams will be cached. Applicable to end results for movies and individual episodes; **default** 6 * 60 * 60; // 6 hours
 - `STREAM_EMPTY_TTL` - time in seconds how long empty stream results will be cached. We want to cache empty results for less time since they could be empty because of timeouts/errors; **default** 15 * 60; // 15 minutes
