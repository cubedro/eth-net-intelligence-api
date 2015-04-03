#!/bin/bash
trap "exit" INT
if [[ -f /usr/bin/geth ]];
then
	geth -rpc -maxpeers "50" -loglevel "1"
else
	eth -b -x 50 -r 52.16.188.185 -p 30303 -m off -n off -v 0 -j
fi