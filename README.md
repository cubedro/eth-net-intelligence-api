Ethereum Network Intelligence API
============
[![Build Status][travis-image]][travis-url] [![dependency status][dep-image]][dep-url]

This is the backend service which runs along with the node for tracking the ethereum network status, fetches information through the JSON-RPC and connects through WebSockets to [eth-netstats](https://github.com/cubedro/eth-netstats) and feed information constantly.

## Prerequisite
* cpp-ethereum
* node
* npm


## Installation on Ubuntu

Fetch and run the build shell. This will install everything you need: latest cpp-ethereum - CLI (develop branch), node.js, npm, pm2.

```
curl https://raw.githubusercontent.com/cubedro/eth-net-intelligence-api/master/bin/build.sh | sh
```

## Run

Run it using pm2:

```
cd ~/bin/www
pm2 start processes.json
```

## Configuration

Configure the app in [processes.json](/eth-net-intelligence-api/blob/master/processes.json)

```
"env":
	{
		"NODE_ENV"	: "production", // tell the client we're in production environment
		"RPC_HOST"	: "localhost", // eth JSON-RPC host
		"RPC_PORT"	: "8080", // eth JSON-RPC port
		"WS_SERVER"	: "", // path to eth-netstats WebSockets api server
	}
```

[travis-image]: https://travis-ci.org/cubedro/eth-net-intelligence-api.svg
[travis-url]: https://travis-ci.org/cubedro/eth-net-intelligence-api
[dep-image]: https://david-dm.org/cubedro/eth-net-intelligence-api.svg
[dep-url]: https://david-dm.org/cubedro/eth-net-intelligence-api