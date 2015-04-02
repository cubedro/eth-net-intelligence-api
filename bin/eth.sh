#!/bin/bash
trap "exit" INT
if [ -f /usr/bin/ethereum ]
then
	ethereum -rpc true
else
	eth -x 15 -l 30303 -n off -m off -v 1 -j
fi