'use strict';

var web3 = require('web3');
var _ = require('lodash');
var os = require('os');
var shelljs = require('shelljs');
var debounce = require('debounce');
var registrar = require('./registrar.js');
var pjson = require('./../package.json');
var temporal = require('temporal');

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

Socket = Primus.createSocket({
	transformer: 'websockets',
	pathname: '/api',
	timeout: 60000,
	strategy: 'disconnect,online',
	plugin: {emitter: Emitter, sparkLatency: Latency}
});

if(process.env.NODE_ENV === 'production' && INSTANCE_NAME === "")
{
	INSTANCE_NAME = shelljs.exec('ec2metadata --instance-id', {silent: true}).output;
}


function Node()
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

	this._lastLatestLog = 0;
	this._lastPendingLog = 0;
	this._called = 0

	this.startWeb3Connection();

	return this;
}

Node.prototype.startWeb3Connection = function()
{
	console.info("==> Starting eth connection");

	web3.setProvider( new web3.providers.HttpProvider('http://' + (process.env.RPC_HOST || 'localhost') + ':' + (process.env.RPC_PORT || '8080')) );

	this.checkWeb3Connection();
}

Node.prototype.checkWeb3Connection = function()
{
	var self = this;

	if(!this._web3)
	{
		try {
			var tmp = web3.version.client;

			if( !_.isUndefined(tmp) )
			{
				console.log('eth ', tmp);
				console.info("==> Ethereum connection established");

				this._web3 = true;
				this.init();

				return true;
			}
		}
		catch(err)
		{
			console.error('xx> Ethereum connection atempt #' + this.called++ + ' failed; ', err);

			process.nextTick( function()
			{
				self.checkWeb3Connection();
			});
		}
	}
}

Node.prototype.startSocketConnection = function()
{
	console.info("==> Starting socket connection");

	socket = new Socket( process.env.WS_SERVER || 'ws://localhost:3000' );

	this.setupSockets();
}

Node.prototype.setupSockets = function()
{
	var self = this;

	// Setup events
	socket.on('open', function open()
	{
		console.info('==> The connection has been opened.');
		console.info('Trying to login');

		socket.emit('hello', {
			id: self.id,
			info: self.info,
			secret: WS_SECRET
		});
	})
	.on('ready', function()
	{
		self._socket = true;
		self.sendUpdate(true);

		console.info('==> The connection has been established.');
	})
	.on('data', function incoming(data)
	{
		console.info('Received some data', data);
	})
	.on('history', function (data)
	{
		console.info('==> Getting history');

		var reqHistory = self.getHistory( data );

		socket.emit('history', {
			id: self.id,
			history: reqHistory
		});
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
		console.error('xx> Socket connection closed');
	})
	.on('error', function error(err)
	{
		console.error("socket:", err);
	})
	.on('reconnecting', function reconnecting(opts)
	{
		console.warn('We are scheduling a reconnect operation', opts);
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
			console.error("socket.emit:", err);
		}
	}
}

Node.prototype.isActive = function()
{
	this._tries++;

	try {
		var peers = web3.toDecimal(web3.net.peerCount);

		if(peers !== null)
		{
			this.stats.peers = peers;
			this.stats.active = true;

			return true;
		}
	}
	catch (err) {
		console.error("peerCount:", err);
	}

	this.stats.active = false;
	this.stats.listening = false;
	this.stats.mining = false;
	this.stats.peers = 0;
	this._down++;

	return false;
}

Node.prototype.getInfo = function()
{
	try {
		this.info.coinbase = web3.eth.coinbase;
		this.info.node = web3.version.client;
		this.info.net = web3.version.network;
		this.info.protocol = web3.toDecimal(web3.version.ethereum);
		this.info.api = web3.version.api;

		console.info(this.info);

		return true;
	}
	catch (err) {
		console.error("Couldn't get version");
	}

	return false;
}

Node.prototype.getBlock = function(number)
{
	var block = {
		number: 0,
		hash: '?',
		difficulty: 0,
		timestamp: 0
	};

	if( _.isUndefined(number) ){
		number = "latest";
		// try {
		// 	number = web3.eth.blockNumber;

		// 	if(number === this.stats.block.number)
		// 		return this.stats.block;
		// }
		// catch (err) {
		// 	console.error("blockNumber:", err);
		// }
	}

	try {
		block = web3.eth.getBlock(number, true);

		if( block.hash != '?' && !_.isUndefined(block.difficulty) )
		{
			block.difficulty = web3.toDecimal( block.difficulty );
		}
	}
	catch (err) {
		console.error("getBlock(" + number + "):", err);

		if(number > 0)
		{
			try {
				number--;

				block = web3.eth.getBlock(number, true);

				if(block.hash !== '?' && !_.isUndefined(block.difficulty) )
				{
					block.difficulty = web3.toDecimal( block.difficulty );
				}
			}
			catch (err) {
				console.error("getBlock(" + number + "):", err);
			}
		}
	}

	return block;
}

Node.prototype.getMinerName = function(miner)
{
	var result = _.find(this._knownMiners, {miner: miner});

	if(result !== undefined)
	{
		return result.name;
	}
	else
	{
		if(this._Registrar !== null)
		{
			var name = this._Registrar.name(miner);

			if(name.length > 0)
			{
				this._knownMiners.push({miner: miner, name: name});
				return name;
			}
		}

		this._knownMiners.push({miner: miner, name: false});
	}

	return false;
}

Node.prototype.uptime = function()
{
	this.stats.uptime = ((this._tries - this._down) / this._tries) * 100;
}

Node.prototype.getStats = function()
{
	if(this._socket)
		this._lastStats = JSON.stringify(this.stats);

	if(this.isActive())
	{
		var block = this.getBlock();

		if( !_.isUndefined(block) && !_.isUndefined(block.number) && !_.isUndefined(block.hash) && block.hash !== '?' )
		{
			this.stats.block = block;

			if(PENDING_WORKS) {
				try
				{
					this.stats.pending = web3.eth.getBlockTransactionCount('pending');
				}
				catch (err)
				{
					PENDING_WORKS = false;
					console.error("getBlockTransactionCount('pending'):", err);
				}
			}

			this.stats.mining = web3.eth.mining;

			if(this.stats.mining)
			{
				try {
					this.stats.hashrate = web3.eth.hashrate;
				}
				catch (err)
				{
					console.error('hashrate: ', err);
					this.stats.hashrate = 0;
				}
			}
			else
				this.stats.hashrate = 0;

			this.stats.gasPrice = web3.toBigNumber(web3.eth.gasPrice).toString(10);
		}
		else
		{
			console.error("getStats: couldn't fetch block...");
		}
	}

	this.uptime();
}

Node.prototype.getHistory = function(range)
{
	var history = [];
	var interv = {};

	if( _.isUndefined(range) || range === null)
	{
		interv = {
			min: this.stats.block.number - MAX_HISTORY_UPDATE,
			max: this.stats.block.number - 1
		};
	}

	if( !_.isUndefined(range.list) )
	{
		interv = {
			min: 0,
			max: range.list.length - 1
		};
	}

	for(var i = interv.min; i <= interv.max; i++)
	{
		var block = this.getBlock(( !_.isUndefined(range.list) ? range.list[i] : i));

		if( block !== null && !_.isUndefined(block.number) )
		{
			history.push( block );
		}
	}

	return history.reverse();
}

Node.prototype.changed = function()
{
	var changed = ! _.isEqual( this._lastStats, JSON.stringify(this.stats) );

	if(this._tries - this._lastSent > 5)
	{
		this._lastSent = this._tries;

		return true;
	}

	return changed;
}

Node.prototype.prepareStats = function()
{
	return {
		id: this.id,
		stats: this.stats
	};
}

Node.prototype.sendUpdate = function(force)
{
	if( this.changed() || force )
		this.emit('update', this.prepareStats());
}

Node.prototype.update = function()
{
	this.getStats();

	this.sendUpdate();

	return this.stats;
};

Node.prototype.updatePending = function()
{
	if(PENDING_WORKS)
	{
		try {
			this.stats.pending = web3.eth.getBlockTransactionCount('pending');
			this.sendUpdate();
		}
		catch (err) {
			PENDING_WORKS = false;
			console.error("getBlockTransactionCount('pending'):", err);
		}
	}
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
		this.pendingFilter = web3.eth.filter('pending');
		this.pendingFilter.watch( function (log)
		{
			if(PENDING_WORKS) {
				var now = _.now();
				var time = now - self._lastPendingLog;

				if(time > 50)
				{
					self.update();
				}
				else
				{
					debounce(function() {
						self.updatePending();
					}, 50);
				}

				self._lastPendingLog = now;
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
	try {
		Contract = web3.eth.contract( registrar.desc );
		this._Registrar = new Contract( registrar.address );
	}
	catch (err)
	{
		console.error("Couldn't set up registrar contract");
		console.error(err);
	}
}

Node.prototype.init = function()
{
	this.getInfo();
	this.startSocketConnection();
	this.installContract();
	this.setWatches();
	this.update();
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
