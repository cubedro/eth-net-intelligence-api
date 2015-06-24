#!/usr/bin/env bash

trap "exit" INT

if [[ -f $(which ec2metadata 2>/dev/null) ]]
then
	# If ec2 instance then get ips from ec2metadata
	LOCALIP=$(ec2metadata --local-ipv4)
	IP=$(ec2metadata --public-ipv4)
else
	# Else get IPs from ifconfig and dig
	LOCALIP=$(ifconfig | grep 'inet ' | grep -v '127.0.0.1' | head -n1 | awk '{print $2}' | cut -d':' -f2)
	IP=$(dig +short myip.opendns.com @resolver1.opendns.com)
fi

echo "Local IP: $LOCALIP"
echo "Public IP: $IP"

if [[ -f $(which geth 2>/dev/null) ]]
then
	echo "Starting geth"
	echo geth --rpc --bootnodes "enode://09fbeec0d047e9a37e63f60f8618aa9df0e49271f3fadb2c070dc09e2099b95827b63a8b837c6fd01d0802d457dd83e3bd48bd3e6509f8209ed90dabbc30e3d3@52.16.188.185:30303" --nat "extip:$IP"
	geth --rpc --bootnodes "enode://09fbeec0d047e9a37e63f60f8618aa9df0e49271f3fadb2c070dc09e2099b95827b63a8b837c6fd01d0802d457dd83e3bd48bd3e6509f8209ed90dabbc30e3d3@52.16.188.185:30303" --nat "extip:$IP"

elif [[ -f $(which eth 2>/dev/null) ]]
then
	echo "Starting eth"
	echo eth --bootstrap --peers 50 --remote 52.16.188.185:30303 --mining off --json-rpc -v 3 --public-ip $IP --listen-ip $LOCALIP --master $1
	eth --bootstrap --peers 50 --remote 52.16.188.185:30303 --mining off --json-rpc -v 3 --public-ip $IP --listen-ip $LOCALIP --master $1

else
	echo "Ethereum was not found!"
	exit 1;
fi