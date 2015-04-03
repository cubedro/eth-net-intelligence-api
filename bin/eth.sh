#!/bin/bash
trap "exit" INT
if [[ -f /usr/bin/geth ]];
then
	geth -rpc -rpcport "8080" -maxpeers "50" -loglevel "1"
else
	eth -b -x 50 -r poc-9.ethdev.com -p 30303 -m off -n off -v 0 -j
fi