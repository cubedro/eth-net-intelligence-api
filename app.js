var nodeModel = require('./lib/node');

var node = new nodeModel();

var gracefulShutdown = function() {
    console.log("Received kill signal, shutting down gracefully.");

    node.stop();
    console.log("Closed node watcher");

    setTimeout(function(){
        console.log("Closed out remaining connections.");
        process.exit(0)
    }, 2*1000);
}

// listen for TERM signal .e.g. kill
process.on('SIGTERM', gracefulShutdown);

// listen for INT signal e.g. Ctrl-C
process.on('SIGINT', gracefulShutdown);

// listen for shutdown signal from pm2
process.on('message', function(msg) {
	if (msg == 'shutdown')
		gracefulShutdown();
});

module.exports = node;
