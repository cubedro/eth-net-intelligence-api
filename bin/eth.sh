#!/bin/bash
IP=$(ec2metadata --public-ipv4)
trap "exit" INT
if [[ -f /usr/bin/geth ]];
then
	geth -rpc -rpcport "8080" -maxpeers "50" -loglevel "4" -bootnodes "enode://09fbeec0d047e9a37e63f60f8618aa9df0e49271f3fadb2c070dc09e2099b95827b63a8b837c6fd01d0802d457dd83e3bd48bd3e6509f8209ed90dabbc30e3d3@52.16.188.185:30303" -nat "extip:$IP"
else
	eth --bootstrap --peers 50 --remote 52.16.188.185:30303 --mining off --json-rpc --public-ip $IP -v 4
fi