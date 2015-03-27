#!/bin/bash
trap "exit" INT
if [ -f /usr/bin/ethereum ]
then
	ethereum -rpc true
else
	eth -x 15 -l 30303 -r poc-8.ethdev.com -p 30303 -m off -v 1 -j
fi