#!/bin/bash
trap "exit" INT
if [[ -f /usr/bin/geth ]];
then
	geth -rpc -rpcport "8080" -maxpeers "20" -loglevel "2" -bootnodes "enode://09fbeec0d047e9a37e63f60f8618aa9df0e49271f3fadb2c070dc09e2099b95827b63a8b837c6fd01d0802d457dd83e3bd48bd3e6509f8209ed90dabbc30e3d3@52.16.188.185:30303"
else
	eth -b -x 20 -r 52.16.188.185 -p 30303 -m off -v 1 -j
fi