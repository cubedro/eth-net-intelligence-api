#!/bin/bash

if [[ -f /usr/bin/geth ]];
then
	ethtype="geth"
else
	ethtype="eth"
fi

pm2 kill
sudo apt-get remove $eth -y

sudo apt-get clean
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo add-apt-repository -y ppa:ethereum/ethereum-dev
sudo apt-get update -y
sudo apt-get upgrade -y

sudo apt-get install $eth

cd ~/bin/www
git pull
sudo npm update
cd ..
pm2 start processes.json
