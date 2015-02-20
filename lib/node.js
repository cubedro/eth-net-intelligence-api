var web3 = require('ethereum.js');
var _ = require('lodash');
var os = require('os');
var shelljs = require('shelljs');

var Primus = require('primus'),
	Emitter = require('primus-emit'),
	Socket;

Socket = Primus.createSocket({
	transformer: 'websockets',
	pathname: '/api',
	plugin: {emitter: Emitter}
});

var INSTANCE_NAME,
	ETH_VERSION;

if(process.env.NODE_ENV === 'production')
{
	INSTANCE_NAME = shelljs.exec('ec2metadata --instance-id', {silent: true}).output;
	ETH_VERSION = shelljs.exec('eth -V', {silent: true}).output;
}

var socket = new Socket(process.env.WS_SERVER || 'ws://localhost:3000');

var MAX_BLOCKS_HISTORY = 12;

function Node()
{
	var self = this;

	this.info = {
		name: INSTANCE_NAME || (process.env.EC2_INSTANCE_ID || os.hostname()),
		node: ETH_VERSION || (process.env.ETH_VERSION || 'eth version 0.8.1'),
		os: os.platform(),
		os_v: os.release()
	};

	this.id = _.camelCase(this.info.name);

	console.log(this.info);

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
		uptime: 0,
		errors: []
	};
	this._lastStats = JSON.stringify(this.stats);

	this._tries = 0;
	this._down = 0;
	this._lastSent = 0;

	this.blocks = [];

	this._socket = null;
	this.pendingWatch = false;
	this.chainWatch = false;
	this.updateInterval = false;

	web3.setProvider(new web3.providers.HttpSyncProvider('http://' + (process.env.RPC_HOST || 'localhost') + ':' + (process.env.RPC_PORT || '8080')));

	socket.on('open', function open() {
		socket.emit('hello', { id: self.id, info: self.info});
		console.log('The connection has been opened.');
	}).on('end', function end() {
		self._socket = false;
	}).on('error', function error(err) {
		console.log(err);
	}).on('reconnecting', function reconnecting(opts) {
		console.log('We are scheduling a reconnect operation', opts);
	}).on('data', function incoming(data) {
		console.log('Received some data', data);
	});

	socket.on('ready', function()
	{
		self._socket = true;
		self.sendUpdate(true);

		console.log('The connection has been established.');
	})

	this.init();

	return this;
}

Node.prototype.isActive = function()
{
	this._tries++;
	this.stats.errors = [];

	try {
		var peers = web3.eth.peerCount;

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
			number = parseInt(web3.eth.number);

			if(number === this.stats.block.number + 1)
				return this.stats.block;
		}
		catch (err) {
			this.stats.errors.push({
				code: '3',
				msg: err
			});
		}
	}

	try {
		block = web3.eth.block(number);

		if(block.hash != '?' && typeof block.difficulty !== 'undefined')
		{
			block.difficulty = web3.toDecimal(block.difficulty);

			try {
				block.txCount = web3.eth.transactionCount(block.hash) || '?';
			}
			catch (err) {
				console.log(err);
			}
		}
	}
	catch (err) {
		this.stats.errors.push({
			code: '2',
			msg: err
		});
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

	this.calculateBlockTimes();
	this.stats.blocktimeAvg = this.blockTimesAvg();
	this.stats.difficulty = this.difficultyChart();
	this.stats.txDensity = this.txDensityChart();
}

Node.prototype.addBlockHistory = function(block)
{
	if(this.blocks.length === 0 || block.number !== this.blocks[0].number)
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

		self.blocks[key].blocktime = diff;

		return diff;
	});

	return blockTimes;
}

Node.prototype.blockTimesAvg = function()
{
	var sum = _.reduce(this.blocks, function(memo, block) { return memo + block.blocktime;}, 0);

	return sum/this.blocks.length;
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
		return block.txCount;
	});
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

		this.stats.mining = web3.eth.mining;
		this.stats.gasPrice = web3.toDecimal(web3.eth.gasPrice);
		this.stats.listening = web3.eth.listening;
	}

	this.uptime();
}

Node.prototype.changed = function()
{
	var changed = ! _.isEqual(this._lastStats, JSON.stringify(this.stats));

	if(this._tries - this._lastSent > 5)
	{
		console.log('force send');
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

Node.prototype.setWatches = function()
{
	var self = this;

	this.pendingWatch = web3.eth.watch('pending');
	this.pendingWatch.changed(function(log) {
		console.log('pending changed');
		self.stats.pending = parseInt(log.number);
	});

	this.chainWatch = web3.eth.watch('chain');
	this.chainWatch.messages(function(log) {
		console.log('block changed');
		self.update();
	});

	this.updateInterval = setInterval(function(){
		self.update();
	}, 1000);
}

Node.prototype.emit = function(message, payload)
{
	if(this._socket){
		try {
			socket.emit(message, payload);
		}
		catch (err) {
			console.log(err);
		}
	}
}

Node.prototype.init = function()
{
	this.update();
	this.setWatches();
}

Node.prototype.stop = function()
{
	if(this._socket)
		socket.end();

	if(this.updateInterval)
		clearInterval(this.updateInterval);

	if(this.pendingWatch)
		this.pendingWatch.uninstall();

	if(this.chainWatch)
		this.chainWatch.uninstall();
}

module.exports = Node;