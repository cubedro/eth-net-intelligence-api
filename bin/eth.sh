#!/bin/bash
trap "exit" INT
if [[ -f /usr/bin/geth ]];
then
	geth -rpc -maxpeers "50" -loglevel "1"
else
	eth -b -x 50 -r poc-9.ethdev.com -p 30303 -v 1 -j
fi