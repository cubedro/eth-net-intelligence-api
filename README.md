Ethereum Network Intelligence API
============
[![Build Status][travis-image]][travis-url] [![dependency status][dep-image]][dep-url]

This is the backend service which runs along with ethereum and tracks the network status, fetches information through JSON-RPC and connects through WebSockets to [eth-netstats](https://github.com/gangnamtestnet/eth-netstats) to feed information. For full install instructions please read the [wiki](https://github.com/ethereum/wiki/wiki/Network-Status).


## Prerequisite

* geth or parity
* nodejs
* npm

## Configuration

Configure the app modifying [app.json.example](/eth-net-intelligence-api/blob/master/app.json.example).

```js
"env":
	{
		"NODE_ENV"        : "production", // tell the client we're in production environment
		"RPC_HOST"        : "localhost", // eth JSON-RPC host
		"RPC_PORT"        : "8545", // eth JSON-RPC port
		"LISTENING_PORT"  : "30303", // eth listening port (only used for display)
		"INSTANCE_NAME"   : "", // whatever you wish to name your node
		"CONTACT_DETAILS" : "", // add your contact details here if you wish (email/skype)
		"WS_SERVER"       : "ws://boot.gangnam.ethdevops.io", // path to eth-netstats WebSockets api server
		"WS_SECRET"       : "psy", // WebSockets api server secret used for login
		"VERBOSITY"       : 2 // Set the verbosity (0 = silent, 1 = error, warn, 2 = error, warn, info, success, 3 = all logs)
	}
```

## Run

Run it using pm2:

```bash
cp app.json.example app.json
pm2 start app.json
```

## Startup

To enable at system startup use the following command:

```bash
pm2 save
pm2 startup
```

[travis-image]: https://travis-ci.org/gangnamtestnet/eth-net-intelligence-api.svg
[travis-url]: https://travis-ci.org/gangnamtestnet/eth-net-intelligence-api
[dep-image]: https://david-dm.org/gangnamtestnet/eth-net-intelligence-api.svg
[dep-url]: https://david-dm.org/gangnamtestnet/eth-net-intelligence-api
