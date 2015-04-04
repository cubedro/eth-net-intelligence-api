#!/bin/bash
trap "exit" INT
if [[ -f /usr/bin/geth ]];
then
	geth -rpc -rpcport "8080" -maxpeers "50" -loglevel "2"
else
	eth -b -x 50 -r 52.5.125.115 -p 30303 -m off -v 1 -j
fi