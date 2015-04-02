#!/bin/bash
trap "exit" INT
if [[ -f /usr/bin/geth ]];
then
	geth --rpc true --loglevel 1
else
	eth -x 15 -l 30303 -n off -m off -v 1 -j
fi