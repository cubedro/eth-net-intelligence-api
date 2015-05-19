'use strict';

require('./utils/logger.js');

var os = require('os');
var web3 = require('web3');
var async = require('async');
var _ = require('lodash');
var shelljs = require('shelljs');
var debounce = require('debounce');
var registrar = require('./registrar.js');
var pjson = require('./../package.json');
var chalk = require('chalk');

var Primus = require('primus'),
	Emitter = require('primus-emit'),
	Latency = require('primus-spark-latency'),
	Socket, socket;

var ETH_VERSION,
	NET_VERSION,
	PROTOCOL_VERSION,
	API_VERSION,
	COINBASE;

var INSTANCE_NAME = process.env.INSTANCE_NAME;
var WS_SECRET = process.env.WS_SECRET || "eth-net-stats-has-a-secret";

var Contract = null;

var PENDING_WORKS = true;
var MAX_BLOCKS_HISTORY = 40;
var UPDATE_INTERVAL = 5000;
var PING_INTERVAL = 2000;
var MINERS_LIMIT = 5;
var MAX_HISTORY_UPDATE = 50;
var MAX_CONNECTION_ATTEMPTS = 15;

Socket = Primus.createSocket({
	transformer: 'websockets',
	pathname: '/api',
	timeout: 120000,
	strategy: 'disconnect,online,timeout',
	plugin: {emitter: Emitter, sparkLatency: Latency}
});

if(process.env.NODE_ENV === 'production' && INSTANCE_NAME === "")
{
	INSTANCE_NAME = shelljs.exec('ec2metadata --instance-id 2>/dev/null', {silent: true}).output;
}

console.log('');
console.info('NET STATS CLIENT');
console.success('v' + pjson.version);
console.log('');
console.log('');

function Node ()
{
	this.info = {
		name: INSTANCE_NAME || (process.env.EC2_INSTANCE_ID || os.hostname()),
		contact: (process.env.CONTACT_DETAILS || ""),
		coinbase: null,
		node: null,
		net: null,
		protocol: null,
		api: null,
		port: (process.env.LISTENING_PORT || 30303),
		os: os.platform(),
		os_v: os.release(),
		client: pjson.version,
		canUpdateHistory: true,
	};

	this.id = _.camelCase(this.info.name);

	this.stats = {
		active: false,
		listening: false,
		mining: false,
		hashrate: 0,
		peers: 0,
		pending: 0,
		gasPrice: 0,
		block: {},
		miners: [],
		uptime: 0
	};

	this._lastStats = JSON.stringify(this.stats);
	this._lastFetch = 0;

	this._tries = 0;
	this._down = 0;
	this._lastSent = 0;
	this._latency = 0;

	this._Registrar = null;
	this._knownMiners = [];


	this._web3 = false;
	this._socket = false;

	this.pendingFilter = false;
	this.chainFilter = false;
	this.updateInterval = false;
	this.pingInterval = false;
	this.connectionInterval = false;

	this._lastChainLog = 0;
	this._lastPendingLog = 0;
	this._connection_attempts = 0

	this.startWeb3Connection();

	return this;
}

Node.prototype.startWeb3Connection = function()
{
	console.info('Starting web3 connection');

	web3.setProvider( new web3.providers.HttpProvider('http://' + (process.env.RPC_HOST || 'localhost') + ':' + (process.env.RPC_PORT || '8545')) );

	this.checkWeb3Connection();
}

Node.prototype.checkWeb3Connection = function()
{
	var self = this;

	if (!this._web3)
	{
		try {
			var tmp = web3.version.client;

			if( !_.isUndefined(tmp) )
			{
				console.log('         ', tmp);
				console.success('Web3 connection established');

				this._web3 = true;
				this.init();

				return true;
			}
		}
		catch (err)
		{
			if(this._connection_attempts < MAX_CONNECTION_ATTEMPTS)
			{
				console.error('Web3 connection attempt', chalk.cyan('#' + this._connection_attempts++), 'failed');
				console.error('Trying again in', chalk.cyan(500 * this._connection_attempts + ' ms'));

				setTimeout(function ()
				{
					self.checkWeb3Connection();
				}, 1000 * this._connection_attempts);
			}
			else
			{
				console.error('Web3 connection failed', chalk.cyan(MAX_CONNECTION_ATTEMPTS), 'times. Aborting...');
			}
		}
	}
}

Node.prototype.startSocketConnection = function()
{
	console.info('wsc', 'Starting socket connection');

	socket = new Socket( process.env.WS_SERVER || 'ws://localhost:3000' );

	this.setupSockets();
}

Node.prototype.setupSockets = function()
{
	var self = this;

	// Setup events
	socket.on('open', function open()
	{
		console.info('wsc', 'The socket connection has been opened.');
		console.log('         ', 'Trying to login');

		socket.emit('hello', {
			id: self.id,
			info: self.info,
			secret: WS_SECRET
		});
	})
	.on('ready', function()
	{
		self._socket = true;
		console.success('wsc', 'The socket connection has been established.');

		self.updateBlock();
		self.update(true);
	})
	.on('data', function incoming(data)
	{
		console.info('Socket received some data', data);
	})
	.on('history', function (data)
	{
		console.info('his', 'Got history request');

		self.getHistory( data );
	})
	.on('node-pong', function(data)
	{
		var latency = Math.ceil( (_.now() - self._latency) / 2 );

		socket.emit('latency', {
			id: self.id,
			latency: latency
		});
	})
	.on('end', function end()
	{
		self._socket = false;
		console.error('wsc', 'Socket connection end received');
	})
	.on('error', function error(err)
	{
		console.error('wsc', 'Socket error:', err);
	})
	.on('timeout', function ()
	{
		console.error('wsc', 'Socket connection timeout');
	})
	.on('close', function ()
	{
		self._socket = false;
		console.error('wsc', 'Socket connection has been closed');
	})
	.on('offline', function ()
	{
		self._socket = false;
		console.error('wsc', 'Network connection is offline');
	})
	.on('online', function ()
	{
		console.info('wsc', 'Network connection is online');
	})
	.on('reconnect', function ()
	{
		console.info('wsc', 'Socket reconnect attempt started');
	})
	.on('reconnect scheduled', function (opts)
	{
		console.warn('wsc', 'Reconnecting in', opts.scheduled, 'ms');
		console.warn('wsc', 'This is attempt', opts.attempt, 'out of', opts.retries);
	})
	.on('reconnected', function (opts)
	{
		console.success('wsc', 'Socket reconnected successfully after', opts.duration, 'ms');
	})
	.on('reconnect timeout', function (err, opts)
	{
		console.error('wsc', 'Socket reconnect atempt took too long:', err.message);
	})
	.on('reconnect failed', function (err, opts)
	{
		console.error('wsc', 'Socket reconnect failed:', err.message);
	});
}

Node.prototype.emit = function(message, payload)
{
	if(this._socket)
	{
		try {
			socket.emit(message, payload);
		}
		catch (err) {
			console.error('wsc', 'Socket emit error:', err);
		}
	}
}

Node.prototype.getInfo = function()
{
	console.info('==>', 'Getting info');
	console.time('Got info');

	try {
		this.info.coinbase = web3.eth.coinbase;
		this.info.node = web3.version.client;
		this.info.net = web3.version.network;
		this.info.protocol = web3.toDecimal(web3.version.ethereum);
		this.info.api = web3.version.api;

		console.timeEnd('Got info');
		console.info(this.info);

		return true;
	}
	catch (err) {
		console.error("Couldn't get version");
	}

	return false;
}

Node.prototype.setInactive = function()
{
	this.stats.active = false;
	this.stats.peers = 0;
	this.stats.pending = 0;
	this.stats.mining = false;
	this.stats.hashrate = 0;
	this.stats.gasPrice = 0;
	this.stats.minerName = false;
	this._down++;

	return this;
}

Node.prototype.setUptime = function()
{
	this.stats.uptime = ((this._tries - this._down) / this._tries) * 100;
}

Node.prototype.getBlock = function(number)
{
	var block = {
		number: 0,
		hash: '?',
		difficulty: 0,
		timestamp: 0,
		miner: ''
	};

	if( _.isUndefined(number) )
		number = "latest";

	try {
		block = this.formatBlock( web3.eth.getBlock(number, true) );
	}
	catch (err) {
		console.error('getBlock(' + chalk.reset.cyan(number) + '):', err);

		return false;
	}

	return block;
}

Node.prototype.formatBlock = function (block)
{
	if( !_.isUndefined(block) && !_.isUndefined(block.number) && block.number >= 0 && !_.isUndefined(block.difficulty) && !_.isUndefined(block.totalDifficulty) )
	{
		block.difficulty = web3.toDecimal( block.difficulty );
		block.totalDifficulty = web3.toDecimal( block.totalDifficulty );

		return block;
	}

	return false;
}

Node.prototype.getStatsBlock = function ()
{
	if(this._socket)
		this._lastStats = JSON.stringify(this.stats);

	if(this._web3)
	{
		var start = _.now();
		var block = this.getBlock();

		if( block )
		{
			this.stats.block = block;
			console.success("==>", "Got block:", chalk.reset.cyan(block.number), 'in', chalk.reset.cyan(_.now() - start, 'ms'));

			this.sendUpdate();
		}
		else
		{
			console.error("xx>", "getStatsBlock couldn't fetch block...");
			console.log(block);
		}
	}
}

Node.prototype.getStats = function(forced)
{
	var self = this;
	var now = _.now();
	var lastFetchAgo = now - this._lastFetch;
	this._lastFetch = now;

	if (this._socket)
		this._lastStats = JSON.stringify(this.stats);

	if (this._web3 && (lastFetchAgo >= UPDATE_INTERVAL || forced === true))
	{
		console.info('==>', 'Getting stats')
		console.log('         ', 'last update:', chalk.reset.cyan(lastFetchAgo));
		console.log('         ', 'forced:', chalk.reset.cyan(forced === true));

		async.parallel({
			start: function (callback)
			{
				callback(null, _.now());
			},
			peers: function (callback)
			{
				async.nextTick(function () {
					var peers = null;
					var error = null;

					try {
						peers = web3.toDecimal(web3.net.peerCount);
					}
					catch (err) {
						console.error('xx>', 'PeerCount failed: ', err);
						error = err;
					}

					callback(error, peers);
				});
			},
			pending: function (callback)
			{
				async.nextTick(function () {
					try {
						web3.eth.getBlockTransactionCount('pending', callback);
					}
					catch (err) {
						console.error('xx>', 'Pending failed: ', err);
						callback(err, null);
					}
				});
			},
			mining: function (callback)
			{
				async.nextTick(function () {
					var mining = null;
					var error = null;

					try {
						mining = web3.eth.mining;
					}
					catch (err) {
						console.error('xx>', 'Mining failed: ', err);
						error = err;
					}

					callback(error, mining);
				});
			},
			hashrate: function (callback)
			{
				if(self.stats.mining) {
					async.nextTick(function () {
						var hashrate = null;
						var error = null;

						try {
							hashrate = web3.eth.hashrate;
						}
						catch (err) {
							console.error('xx>', 'Hashrate failed: ', err);
							error = err;
						}

						callback(error, hashrate);
					});
				}
				else {
					callback(null, 0);
				}
			},
			gasPrice: function (callback)
			{
				async.nextTick(function () {
					var gasPrice = null;
					var error = null;

					try {
						gasPrice = web3.toBigNumber(web3.eth.gasPrice).toString(10);
					}
					catch (err) {
						console.error('xx>', 'gasPrice failed: ', err);
						error = err;
					}

					callback(error, gasPrice);
				});
			},
			// minerName: function (callback)
			// {
			// 	async.nextTick(function () {
			// 		var minerName = null;
			// 		var error = null;

			// 		try {
			// 			minerName = self.getMinerName(self.stats.block.miner);
			// 		}
			// 		catch (err) {
			// 			console.error('xx>', 'minerName failed: ', err);
			// 			error = err;
			// 		}

			// 		callback(error, minerName);
			// 	});
			// }
		},
		function (err, results)
		{
			self._tries++;

			if (err) {
				console.error('xx>', 'getStats error: ', err);

				self.setInactive();

				return false;
			}

			results.end = _.now();
			results.diff = results.end - results.start;

			console.success('==>', 'Got getStats results in', chalk.reset.cyan(results.diff, 'ms'));

			if(results.peers !== null)
			{
				self.stats.active = true;
				self.stats.peers = results.peers;
				self.stats.pending = results.pending;
				self.stats.mining = results.mining;
				self.stats.hashrate = results.hashrate;
				self.stats.gasPrice = results.gasPrice;
			}
			else {
				self.setInactive();
			}

			self.setUptime();

			self.sendUpdate();
		});
	}
}

Node.prototype.getHistory = function (range)
{
	var self = this;

	var history = [];
	var interv = {};

	console.time('=H=', 'his', 'Got history in');

	if ( _.isUndefined(range) || range === null)
		interv = _.range(this.stats.block.number - 1, MAX_HISTORY_UPDATE);

	if (!_.isUndefined(range.list))
		interv = range.list;

	console.info('his', 'Getting history from', chalk.reset.cyan(interv[0]), 'to', chalk.reset.cyan(interv[interv.length - 1]));

	async.mapSeries(interv, function (number, callback)
	{
		async.nextTick(function ()
		{
			var block;

			try {
				block = self.formatBlock(web3.eth.getBlock(number, true));
			}
			catch (err) {
				console.error('xx>', 'history block failed: ', err);
				callback(err, null);
			}

			callback(null, block);
		});
	},
	function (err, results)
	{
		console.timeEnd('=H=', 'his', 'Got history in');

		if (err) {
			console.error('his', 'history fetch failed:', err);

			results = false;
		}

		socket.emit('history', {
			id: self.id,
			history: results.reverse()
		});
	});
}

Node.prototype.getMinerName = function(miner)
{
	var result = _.find(this._knownMiners, { miner: miner });

	if (result !== undefined)
	{
		return result.name;
	}
	else
	{
		if (this._Registrar !== null)
		{
			var name = this._Registrar.name(miner);

			if(name.length > 0)
			{
				this._knownMiners.push({ miner: miner, name: name });
				return name;
			}
		}

		this._knownMiners.push({ miner: miner, name: false });
	}

	return false;
}

Node.prototype.updateBlock = function()
{
	this.getStatsBlock();

	return this;
};

Node.prototype.update = function(forced)
{
	this.getStats(forced);

	return this;
};

Node.prototype.changed = function ()
{
	var changed = ! _.isEqual( this._lastStats, JSON.stringify(this.stats) );

	return changed;
}

Node.prototype.prepareStats = function ()
{
	return {
		id: this.id,
		stats: this.stats
	};
}

Node.prototype.sendUpdate = function (force)
{
	if( this.changed() || force )
		this.emit('update', this.prepareStats());
}

Node.prototype.ping = function()
{
	this._latency = _.now();
	this.emit('node-ping', { id: this.id });
};

Node.prototype.setWatches = function()
{
	var self = this;

	try {
		this.chainFilter = web3.eth.filter('latest');
		this.chainFilter.watch( function (log)
		{
			var now = _.now();
			var time = now - self._lastChainLog;
			self._lastChainLog = now;

			console.info('>>>', 'Chain Filter triggered: ', chalk.reset.cyan(now), '- last trigger:', chalk.reset.cyan(time));

			if(time > 50)
			{
				self.updateBlock();
			}
			else
			{
				debounce(function() {
					self.updateBlock();
				}, 50);
			}
		});
	}
	catch (err)
	{
		console.error("Couldn't set up chain filter");
		console.error(err);
	}

	try {
		this.pendingFilter = web3.eth.filter('pending');
		this.pendingFilter.watch( function (log)
		{
			var now = _.now();
			var time = now - self._lastPendingLog;
			self._lastPendingLog = now;

			console.info('>>>', 'Pending Filter triggered', chalk.reset.cyan(now), '- last trigger:', chalk.reset.cyan(time));

			if(time > 50)
			{
				self.update(true);
			}
			else
			{
				debounce(function() {
					self.update(true);
				}, 50);
			}
		});
	}
	catch (err)
	{
		console.error("Couldn't set up pending filter");
		console.error(err);
	}

	this.updateInterval = setInterval( function(){
		self.update();
	}, UPDATE_INTERVAL);

	this.pingInterval = setInterval( function(){
		self.ping();
	}, PING_INTERVAL);
}

Node.prototype.installContract = function()
{
	var start = _.now();

	try {
		Contract = web3.eth.contract( registrar.desc );
		this._Registrar = new Contract( registrar.address );

		console.success('Installed Registrar contract in', chalk.reset.cyan(_.now() - start, 'ms'));
	}
	catch (err)
	{
		console.error("!!!", "eth", "Couldn't set up registrar contract");
		console.error(err);
	}
}

Node.prototype.init = function()
{
	// Fetch node info
	this.getInfo();

	// Install Registrar contract
	this.installContract();

	// Start socket connection
	this.startSocketConnection();

	// Set filters
	this.setWatches();
}

Node.prototype.stop = function()
{
	if(this._socket)
		socket.end();

	if(this.updateInterval)
		clearInterval(this.updateInterval);

	if(this.pingInterval)
		clearInterval(this.pingInterval);

	web3.reset();
}

module.exports = Node;
