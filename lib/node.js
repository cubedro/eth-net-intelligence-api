var web3 = require('ethereum.js');
var _ = require('underscore');
var os = require('os');
var slugs = require('slugs');
var HttpRequest = require('xmlhttprequest').XMLHttpRequest;

var MAX_BLOCKS_HISTORY = 12,
	LOWEST_TIMESTAMP = 0;

function Node()
{
	this.info = {
		ip: getExternalIp(),
		name: process.env.ETH_CLIENT,
		type: process.env.ETH_TYPE,
		os: os.platform(),
		os_v: os.release()
	};

	this.info.id = this.makeId();
	console.log(this.info);
	this.stats = {
		active: false,
		listening: false,
		mining: false,
		peers: 0,
		pending: 0,
		gasPrice: 0,
		block: {},
		blocks: [],
		difficulty: [],
		uptime: {
			down: 0,
			inc: 0,
			total: 0
		},
		errors: []
	}

	this.pendingWatch = false;
	this.chainWatch = false;
	this.updateInterval = false;

	web3.setProvider(new web3.providers.HttpSyncProvider('http://' + (process.env.RPC_HOST || 'localhost') + ':' + (process.env.RPC_PORT || '8080')));
	this.socket = require('socket.io-client')(process.env.SOCKET_SERVER || 'wss://localhost/socket.io/');

	this.init();

	return this;
}

function getExternalIp()
{
	var request = new HttpRequest();
    request.open('GET', 'http://curlmyip.com/', false);
    request.send();

    if(request.status !== 200)
    	return 'unknown';

    return request.responseText.trim();
}

Node.prototype.makeId = function()
{
	return slugs(this.info.name + ' ' + this.info.type + ' ' + this.info.os + ' ' + this.info.os_v + '   ' + this.info.ip);
}

Node.prototype.isActive = function()
{
	this.stats.uptime.inc++;
	this.stats.errors = [];

	try {
		this.stats.peers = web3.eth.peerCount;
		this.stats.active = true;

		return true;
	}
	catch (err) {
		this.stats.active = false;
		this.stats.listening = false;
		this.stats.mining = false;
		this.stats.peers = 0;
		this.stats.uptime.down++;

		this.stats.errors.push({
			code: '1',
			msg: err
		});

		return false;
	}
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

	if(this.stats.blocks.length > 0)
	{
		maxIterations = Math.min(bestBlock - this.stats.blocks[0].number, MAX_BLOCKS_HISTORY);
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
}

Node.prototype.addBlockHistory = function(block)
{
	if(this.stats.blocks.length === MAX_BLOCKS_HISTORY)
	{
		LOWEST_TIMESTAMP = this.stats.blocks[MAX_BLOCKS_HISTORY - 1].timestamp;
		this.stats.blocks.pop();
	}

	this.stats.blocks.unshift(block);
}

Node.prototype.calculateBlockTimes = function()
{
	var self = this;

	var blockTimes = _.map(this.stats.blocks, function(block, key, list)
	{
		var diff = block.timestamp - (key < list.length - 1 ? list[key + 1].timestamp : LOWEST_TIMESTAMP);

		self.stats.blocks[key].blocktime = diff;

		return diff;
	});

	return blockTimes;
}

Node.prototype.blockTimesAvg = function()
{
	var sum = _.reduce(this.stats.blocks, function(memo, block) { return memo + block.blocktime;}, 0);

	return sum/this.stats.blocks.length;
}

Node.prototype.difficultyChart = function()
{
	return difficulty = _.map(this.stats.blocks, function(block)
	{
		return block.difficulty;
	});
}

Node.prototype.uptime = function()
{
	this.stats.uptime.total = ((this.stats.uptime.inc - this.stats.uptime.down) / this.stats.uptime.inc) * 100;
}

Node.prototype.getStats = function()
{
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

Node.prototype.prepareStats = function()
{
	return {
		id: this.info.id,
		stats: this.stats
	};
}

Node.prototype.update = function()
{
	this.getStats();

	this.socket.emit('update', this.prepareStats());

	return this.stats;
};

Node.prototype.setWatches = function()
{
	var self = this;
	this.pendingWatch = web3.eth.watch('pending');
	this.pendingWatch.changed(function(log) {
		console.log('pending changed');
		self.stats.pending = parseInt(log.length);
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

Node.prototype.init = function()
{
	var self = this;

	this.socket.on('connect', function(){
		self.socket.emit('hello', self.info);
	});

	this.socket.on('disconnect', function() {
		self.socket.emit('goodbye', { id: self.info.id });
	})

	this.update();
	this.setWatches();
}

Node.prototype.stop = function()
{
	this.socket.disconnect();

	if(this.updateInterval)
		clearInterval(this.updateInterval);

	if(this.pendingWatch)
		this.pendingWatch.uninstall();

	if(this.chainWatch)
		this.chainWatch.uninstall();
}

module.exports = Node;