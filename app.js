var nodeModel = require('./lib/node');

var node = new nodeModel();

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


module.exports = node;
