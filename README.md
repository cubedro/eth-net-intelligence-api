Ethereum Network Intelligence API
============
[![Build Status][travis-image]][travis-url] [![dependency status][dep-image]][dep-url]

This is the backend service which runs along with the node for tracking the ethereum network status, fetches information through the JSON-RPC and connects through WebSockets to [eth-netstats](https://github.com/cubedro/eth-netstats) and feed information constantly.

## Prerequisite
* node
* npm
* cpp-ethereum

## Installation on Ubuntu

Fetch and run the build shell.

```
curl https://raw.githubusercontent.com/cubedro/eth-net-intelligence-api/master/bin/build.sh | sh
```

## Run
Run it using pm2:

```
cd ~/bin/www
pm2 start processes.json
```

[travis-image]: https://travis-ci.org/cubedro/eth-net-intelligence-api.svg
[travis-url]: https://travis-ci.org/cubedro/eth-net-intelligence-api
[dep-image]: https://david-dm.org/cubedro/eth-net-intelligence-api.svg
[dep-url]: https://david-dm.org/cubedro/eth-net-intelligence-api