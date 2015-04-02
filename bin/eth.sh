#!/bin/bash
trap "exit" INT
if [[ -f /usr/bin/geth ]];
then
	geth --rpc true --maxpeers "50" --loglevel "1"
else
	eth -x 50 -l 30303 -n off -m off -v 1 -j
fi