#!/bin/bash
trap "exit" INT
if [ -f /usr/bin/ethereum ]
then
	ethereum -rpc true -rpcport 8080
else
	eth -x 15 -l 30303 -r poc-8.ethdev.com -p 30303 -m off -j
fi