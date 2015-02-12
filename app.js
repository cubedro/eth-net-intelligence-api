var express = require('express.io');
var path = require('path');
var fs = require('fs');
var nodeModel = require('./lib/node');
var config;

var app = express();
app.io();

if(fs.existsSync('./config.js')){
    config = require('./config');
} else {
    config = require('./config.default');
}

var node = new nodeModel(config);

console.log(node.stats);

var gracefulShutdown = function() {
    console.log("Received kill signal, shutting down gracefully.");

    node.stop();
    console.log("Closed node watcher");

    setTimeout(function(){
        console.log("Closed out remaining connections.");
        process.exit()
    }, 2*1000);
}

// listen for TERM signal .e.g. kill
process.on('SIGTERM', gracefulShutdown);

// listen for INT signal e.g. Ctrl-C
process.on('SIGINT', gracefulShutdown);


module.exports = app;
