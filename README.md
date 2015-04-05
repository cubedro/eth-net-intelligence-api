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
bash <(curl https://raw.githubusercontent.com/cubedro/eth-net-intelligence-api/master/bin/build.sh)
```

## Configuration

Configure the app modifying [processes.json](/eth-net-intelligence-api/blob/master/processes.json). Note that you have to modify the backup processes.json file located in `./bin/processes.json` (to allow you to set your env vars without being rewritten when updating).

```
"env":
	{
		"NODE_ENV"	: "production", // tell the client we're in production environment
		"RPC_HOST"	: "localhost", // eth JSON-RPC host
		"RPC_PORT"	: "8080", // eth JSON-RPC port
		"INSTANCE_NAME"	     : "",
		"WS_SERVER"	: "", // path to eth-netstats WebSockets api server
		"WS_SECRET"	: "", // WebSockets api server secret used for login
	}
```

## Run

Run it using pm2:

```
cd ~/bin
pm2 start processes.json
```

## Updating

To update the API client use the following commands:

```
pm2 kill
cd ~/bin/www
git pull
sudo npm update
sudo npm install
cd ..
pm2 start processes.json
```

[travis-image]: https://travis-ci.org/cubedro/eth-net-intelligence-api.svg
[travis-url]: https://travis-ci.org/cubedro/eth-net-intelligence-api
[dep-image]: https://david-dm.org/cubedro/eth-net-intelligence-api.svg
[dep-url]: https://david-dm.org/cubedro/eth-net-intelligence-api