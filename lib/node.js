var web3 = require('ethereum.js');
var _ = require('lodash');
var os = require('os');
var shelljs = require('shelljs');
var debounce = require('debounce');
var registrar = require('./registrar.js');

var Primus = require('primus'),
	Emitter = require('primus-emit'),
	Latency = require('primus-spark-latency'),
	Socket;

var ETH_VERSION,
	NET_VERSION,
	API_VERSION;
var INSTANCE_NAME = process.env.INSTANCE_NAME;

var Contract = null;

web3.setProvider(new web3.providers.HttpProvider('http://' + (process.env.RPC_HOST || 'localhost') + ':' + (process.env.RPC_PORT || '8080')));

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

var socket = new Socket(process.env.WS_SERVER || 'ws://localhost:3000');
var WS_SECRET = process.env.WS_SECRET || "eth-net-stats-has-a-secret";

var PENDING_WORKS = true;
var MAX_BLOCKS_HISTORY = 36;
var UPDATE_INTERVAL = 5000;
var PING_INTERVAL = 2000;
var MINERS_LIMIT = 5;

function Node()
{
	var self = this;

	try {
		ETH_VERSION = web3.version.client;
		NET_VERSION = web3.version.network;
		API_VERSION = web3.version.api;
	}
	catch (err) {
		console.error("Couldn't get version");
	}

	this.info = {
		name: INSTANCE_NAME || (process.env.EC2_INSTANCE_ID || os.hostname()),
		node: ETH_VERSION,
		net: NET_VERSION,
		api: API_VERSION,
		os: os.platform(),
		os_v: os.release()
	};

	this.id = _.camelCase(this.info.name);

	console.info(this.info);

	this.stats = {
		active: false,
		listening: false,
		mining: false,
		peers: 0,
		pending: 0,
		gasPrice: 0,
		block: {},
		blocktimeAvg: 0,
		difficulty: [],
		txDensity: [],
		blockTimes: [],
		gasSpending: [],
		miners: [],
		uptime: 0,
		errors: []
	};
	this._lastStats = JSON.stringify(this.stats);
	this._coinbase = web3.eth.coinbase;

	this._tries = 0;
	this._down = 0;
	this._lastSent = 0;
	this._latency = 0;

	this.blocks = [];

	this._Registrar = null;
	this._knownMiners = [];

	this._socket = null;
	this.pendingFilter = false;
	this.chainFilter = false;
	this.updateInterval = false;
	this.pingInterval = false;

	socket.on('open', function open() {
		socket.emit('hello', { id: self.id, info: self.info, secret: WS_SECRET });
		console.info('The connection has been opened.');
		console.info('Trying to login');
	})
	.on('end', function end() {
		self._socket = false;
		console.error('Socket connection closed');
	})
	.on('error', function error(err) {
		console.error("socket:", err);
	})
	.on('reconnecting', function reconnecting(opts) {
		console.warn('We are scheduling a reconnect operation', opts);
	})
	.on('node-pong', function(data) {
		var latency = Math.ceil(((new Date()).getTime() - self._latency)/2);
		socket.emit('latency', { id: self.id, latency: latency });
	})
	.on('data', function incoming(data) {
		console.info('Received some data', data);
	});

	socket.on('ready', function()
	{
		self._socket = true;
		self.sendUpdate(true);

		console.info('The connection has been established.');
	});

	this.init();

	return this;
}

Node.prototype.isActive = function()
{
	this._tries++;
	this.stats.errors = [];

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
		this.stats.errors.push({
			code: '1',
			msg: err
		});
		console.error("peerCount:", err);
	}

	this.stats.active = false;
	this.stats.listening = false;
	this.stats.mining = false;
	this.stats.peers = 0;
	this._down++;

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

	if(typeof number === 'undefined'){
		try {
			number = web3.eth.blockNumber;

			if(number === this.stats.block.number)
				return this.stats.block;
		}
		catch (err) {
			this.stats.errors.push({
				code: '3',
				msg: err
			});
			console.error("blockNumber:", err);
		}
	}

	try {
		block = web3.eth.getBlock(number, true);

		if(block.hash != '?' && typeof block.difficulty !== 'undefined')
		{
			block.difficulty = web3.toDecimal(block.difficulty);
		}
	}
	catch (err) {
		this.stats.errors.push({
			code: '2',
			msg: err
		});
		console.error("getBlock:", err);
	}

	return block;
}

Node.prototype.getLatestBlocks = function()
{
	var bestBlock = this.stats.block.number;
	var maxIterations = MAX_BLOCKS_HISTORY;
	var minBlock = 0;

	if(this.blocks.length > 0)
	{
		maxIterations = Math.min(bestBlock - this.blocks[0].number, MAX_BLOCKS_HISTORY);
	}

	minBlock = Math.max(0, parseInt(bestBlock) - maxIterations);

	for (var i = minBlock; i < bestBlock; i++)
	{
		this.addBlockHistory(this.getBlock(i));
	};

	this.addBlockHistory(this.stats.block);

	this.stats.blockTimes = this.calculateBlockTimes();
	this.stats.blocktimeAvg = this.blockTimesAvg();
	this.stats.difficulty = this.difficultyChart();
	this.stats.txDensity = this.txDensityChart();
	this.stats.gasSpending = this.gasSpendingChart();
	this.stats.miners = this.minersChart();
}

Node.prototype.addBlockHistory = function(block)
{
	if(this.blocks.length === 0 || (block !== null && block.number !== this.blocks[0].number))
	{
		if(this.blocks.length === MAX_BLOCKS_HISTORY)
		{
			this.blocks.pop();
		}

		this.blocks.unshift(block);
	}
}

Node.prototype.calculateBlockTimes = function()
{
	var self = this;

	var blockTimes = _.map(this.blocks, function(block, key, list)
	{
		var diff = (key > 0 ? list[key - 1].timestamp : Math.floor(Date.now()/1000)) - block.timestamp;

		diff = Math.max(diff, 0);

		return diff;
	});

	blockTimes.shift();

	return blockTimes;
}

Node.prototype.blockTimesAvg = function()
{
	var sum = _.reduce(this.stats.blockTimes, function(memo, time) { return memo + time;}, 0);

	return sum/this.stats.blockTimes.length;
}

Node.prototype.difficultyChart = function()
{
	return difficulty = _.map(this.blocks, function(block)
	{
		return block.difficulty;
	});
}

Node.prototype.txDensityChart = function()
{
	return txDensity = _.map(this.blocks, function(block)
	{
		return block.transactions.length;
	});
}

Node.prototype.gasSpendingChart = function()
{
	return gasSpending = _.map(this.blocks, function(block)
	{
		return block.gasUsed;
	});
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
		var name = this._Registrar.call({from: this._coinbase}).name(miner);

		if(name.length > 0)
		{
			this._knownMiners.push({miner: miner, name: name});
			return name;
		}
		else
		{
			this._knownMiners.push({miner: miner, name: false});
			return false;
		}
	}

	return false;
}

Node.prototype.minersChart = function()
{
	var self = this;
	var miners = _.countBy(this.blocks, function(block)
	{
		return block.miner;
	});

	var minersArray = [];

	_.forEach(miners, function(cnt, miner)
	{
		var name = self.getMinerName(miner);
		minersArray.push({miner: miner, name: name, blocks: cnt});
	});

	var minersArray = _.sortBy(minersArray, 'blocks').reverse();

	return minersArray.slice(0, MINERS_LIMIT);
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
		this.stats.block = this.getBlock();

		// Get last MAX_BLOCKS_HISTORY blocks for calculations
		if(this.stats.block.number > 0)
			this.getLatestBlocks();

		if(PENDING_WORKS) {
			try {
				this.stats.pending = web3.eth.getBlockTransactionCount('pending');
			} catch (err) {
				PENDING_WORKS = false;
				console.error("getBlockTransactionCount('pending'):", err);
			}
		}

		this.stats.mining = web3.eth.mining;
		this.stats.gasPrice = web3.toBigNumber(web3.eth.gasPrice).toString(10);
	}

	this.uptime();
}

Node.prototype.changed = function()
{
	var changed = ! _.isEqual(this._lastStats, JSON.stringify(this.stats));

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
	if(this.changed() || force)
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
	if(PENDING_WORKS) {
		try {
			this.stats.pending = web3.eth.getBlockTransactionCount('pending');
			this.sendUpdate();
		} catch (err) {
			PENDING_WORKS = false;
			console.error("getBlockTransactionCount('pending'):", err);
		}
	}
}

Node.prototype.ping = function()
{
	this._latency = (new Date()).getTime();
	this.emit('node-ping', { id: this.id });
};

Node.prototype.setWatches = function()
{
	var self = this;

	this.pendingFilter = web3.eth.filter('pending');
	this.pendingFilter.watch( function(log) {
		if(PENDING_WORKS) {
			debounce(function() {
				self.updatePending();
			}, 50);
		}
	});

	this.chainFilter = web3.eth.filter('latest');
	this.chainFilter.watch(function(log) {
		debounce(function() {
			self.update();
		}, 50);
	});

	this.updateInterval = setInterval(function(){
		self.update();
	}, UPDATE_INTERVAL);

	this.pingInterval = setInterval(function(){
		self.ping();
	}, PING_INTERVAL);
}

Node.prototype.emit = function(message, payload)
{
	if(this._socket){
		try {
			socket.emit(message, payload);
		}
		catch (err) {
			console.error("socket.emit:", err);
		}
	}
}

Node.prototype.installContract = function()
{
	Contract = web3.eth.contract(registrar.desc);
	this._Registrar = new Contract(registrar.address);
}

Node.prototype.init = function()
{
	this.installContract();
	this.update();
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