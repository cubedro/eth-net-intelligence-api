Ubiq Network Intelligence API
============

This is the backend service which runs along with ubiq and tracks the network status, fetches information through JSON-RPC and connects through WebSockets to the [ubiq netstats page](http://ubiq.darcr.us) to feed information.

## Prerequisite
* gubiq
* node
* npm


## Installation
```bash
sudo npm install -g pm2
npm install
```

## Configuration

Configure the app modifying app.json.

```json
"env":
	{
		"NODE_ENV"        : "production", // tell the client we're in production environment
		"RPC_HOST"        : "localhost", // ubiq JSON-RPC host
		"RPC_PORT"        : "8588", // ubiq JSON-RPC port
		"LISTENING_PORT"  : "30388", // ubiq listening port (only used for display)
		"INSTANCE_NAME"   : "", // whatever you wish to name your node
		"CONTACT_DETAILS" : "", // add your contact details here if you wish (email/skype)
		"WS_SERVER"       : "wss://ubiq.darcr.us", // path to ubq-netstats WebSockets api server
		"WS_SECRET"       : "contact xocel or sigwo in the ubiq discord", // WebSockets api server secret used for login
		"VERBOSITY"       : 2 // Set the verbosity (0 = silent, 1 = error, warn, 2 = error, warn, info, success, 3 = all logs)
	}
```

## Run

Run it using pm2:

```bash
pm2 start app.json
```
