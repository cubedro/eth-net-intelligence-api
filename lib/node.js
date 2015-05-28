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

var PENDING_WORKS = true;
var MAX_BLOCKS_HISTORY = 40;
var UPDATE_INTERVAL = 5000;
var PING_INTERVAL = 2000;
var MINERS_LIMIT = 5;
var MAX_HISTORY_UPDATE = 50;
var MAX_CONNECTION_ATTEMPTS = 15;
var CONNECTION_ATTEMPTS_TIMEOUT = 1000;

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
		block: {
			number: 0,
			hash: '?',
			difficulty: 0,
			totalDifficulty: 0,
			transactions: [],
			uncles: []
		},
		miners: [],
		uptime: 0
	};

	this._lastBlock = 0;
	this._lastStats = JSON.stringify(this.stats);
	this._lastFetch = 0;
	this._startBlockFetch = 0;

	this._tries = 0;
	this._down = 0;
	this._lastSent = 0;
	this._latency = 0;

	this._web3 = false;
	this._socket = false;

	this._latestQueue = null;
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
				}, CONNECTION_ATTEMPTS_TIMEOUT * this._connection_attempts);
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

		self.getLatestBlock();
		self.getStats(true);
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
			console.success('wsc', 'Socket emited message:', chalk.reset.cyan(message));
			// console.success('wsc', payload);
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

Node.prototype.formatBlock = function (block)
{
	if( !_.isUndefined(block) && !_.isUndefined(block.number) && block.number >= 0 && !_.isUndefined(block.difficulty) && !_.isUndefined(block.totalDifficulty) )
	{
		block.difficulty = block.difficulty.toString(10);
		block.totalDifficulty = block.totalDifficulty.toString(10);

		if( !_.isUndefined(block.logsBloom) )
		{
			delete block.logsBloom;
		}

		return block;
	}

	return false;
}

Node.prototype.getLatestBlock = function ()
{
	var self = this;

	if(this._socket)
		this._lastStats = JSON.stringify(this.stats);

	if(this._web3)
	{
		var timeString = 'Got block in' + chalk.reset.red('');
		console.time('==>', timeString);

		web3.eth.getBlock('latest', false, function(error, result) {
			self.validateLatestBlock(error, result, timeString);
		});
	}
}

Node.prototype.validateLatestBlock = function (error, result, timeString)
{
	console.timeEnd('==>', timeString);

	if( error )
	{
		console.error("xx>", "getLatestBlock couldn't fetch block...");
		console.error("xx>", error);

		return false;
	}

	var block = this.formatBlock(result);

	if(block === false)
	{
		console.error("xx>", "Got bad block:", chalk.reset.cyan(result));

		return false;
	}

	if( this.stats.block.number === block.number )
	{
		console.warn("==>", "Got same block:", chalk.reset.cyan(block.number));

		return false;
	}

	console.success("==>", "Got block:", chalk.reset.red(block.number));

	this.stats.block = block;
	this.sendUpdate();

	if(this.stats.block.number - this._lastBlock > 1)
	{
		var range = _.range( Math.max(this.stats.block.number - MAX_BLOCKS_HISTORY, this._lastBlock + 1), Math.max(this.stats.block.number, 0), 1 );

		if( this._latestQueue.idle() )
			this.getHistory({ list: range });
	}

	if(this.stats.block.number > this._lastBlock)
	{
		this._lastBlock = this.stats.block.number;
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
			peers: function (callback)
			{
				web3.net.getPeerCount(callback);
			},
			pending: function (callback)
			{
				web3.eth.getBlockTransactionCount('pending', callback);
			},
			mining: function (callback)
			{
				web3.eth.getMining(callback);
			},
			hashrate: function (callback)
			{
				web3.eth.getHashrate(callback);
			},
			gasPrice: function (callback)
			{
				web3.eth.getGasPrice(callback);
			}
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
			results.diff = results.end - self._lastFetch;

			console.success('==>', 'Got getStats results in', chalk.reset.cyan(results.diff, 'ms'));

			if(results.peers !== null)
			{
				self.stats.active = true;
				self.stats.peers = results.peers;
				self.stats.pending = results.pending;
				self.stats.mining = results.mining;
				self.stats.hashrate = results.hashrate;
				self.stats.gasPrice = results.gasPrice.toString(10);
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
		interv = _.range(this.stats.block.number - 1, this.stats.block.number - MAX_HISTORY_UPDATE);

	if (!_.isUndefined(range.list))
		interv = range.list;

	console.info('his', 'Getting history from', chalk.reset.cyan(interv[0]), 'to', chalk.reset.cyan(interv[interv.length - 1]));

	async.mapSeries(interv, function (number, callback)
	{
		web3.eth.getBlock(number, false, callback);
	},
	function (err, results)
	{
		if (err) {
			console.error('his', 'history fetch failed:', err);

			results = false;
		}
		else
		{
			for(var i=0; i < results.length; i++)
			{
				results[i] = self.formatBlock(results[i]);
			}
		}

		self.emit('history', {
			id: self.id,
			history: results.reverse()
		});

		console.timeEnd('=H=', 'his', 'Got history in');
	});
}

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
	if( this.changed() || force ) {
		console.info("wsc", "Sending", chalk.reset.blue((force ? "forced" : "changed")), chalk.bold.white("update"));
		this.emit('update', this.prepareStats());
	}
}

Node.prototype.ping = function()
{
	this._latency = _.now();
	socket.emit('node-ping', { id: this.id });
};

Node.prototype.setWatches = function()
{
	var self = this;

	this._latestQueue = async.queue(function (hash, callback)
	{
		var timeString = 'Got block in ' + chalk.reset.red(hash) + chalk.reset.bold.white(' in') + chalk.reset.green('');

		console.time('==>', timeString);

		web3.eth.getBlock(hash, false, function (error, result)
		{
			self.validateLatestBlock(error, result, timeString);

			callback();
		});
	}, 1);

	this._latestQueue.drain = function()
	{
		console.success("Finished processing", 'latest', 'queue');
	}

	try {
		this.chainFilter = web3.eth.filter('latest');
		this.chainFilter.watch( function (err, hash)
		{
			var now = _.now();
			var time = now - self._lastChainLog;
			self._lastChainLog = now;

			console.info('>>>', 'Chain Filter triggered: ', chalk.reset.red(hash), '- last trigger:', chalk.reset.cyan(time));

			self._latestQueue.push(hash);
		});
	}
	catch (err)
	{
		console.error("Couldn't set up chain filter");
		console.error(err);
	}

	try {
		this.pendingFilter = web3.eth.filter('pending');
		this.pendingFilter.watch( function (err, hash)
		{
			var now = _.now();
			var time = now - self._lastPendingLog;
			self._lastPendingLog = now;

			console.info('>>>', 'Pending Filter triggered:', chalk.reset.red(hash), '- last trigger:', chalk.reset.cyan(time));

			if(time > 50)
			{
				self.getStats(true);
			}
			else
			{
				debounce(function() {
					self.getStats(true);
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
		self.getStats();
	}, UPDATE_INTERVAL);

	this.pingInterval = setInterval( function(){
		self.ping();
	}, PING_INTERVAL);
}

Node.prototype.init = function()
{
	// Fetch node info
	this.getInfo();

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
