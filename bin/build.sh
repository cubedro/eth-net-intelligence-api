#!/bin/sh

cd ~

# let's install packages
sudo apt-get update
sudo apt-get upgrade
sudo apt-get -y install build-essential g++-4.8 git cmake libboost-all-dev automake unzip libgmp-dev libtool libleveldb-dev yasm libminiupnpc-dev libreadline-dev scons libncurses5-dev libcurl4-openssl-dev wget qtbase5-dev qt5-default qtdeclarative5-dev libqt5webkit5-dev libjsoncpp-dev libargtable2-dev nodejs npm

# Setup Ethereum repos
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo add-apt-repository -y ppa:ethereum/ethereum-dev
sudo apt-get update
sudo apt-get install libcryptopp-dev libjson-rpc-cpp-dev

# add node symlink
sudo ln -s /usr/bin/nodejs /usr/bin/node

# create directories structure
[ ! -d "ethereum" ] && mkdir ethereum # ethereum dir maybe mapped from host machine
mkdir opt
mkdir bin
mkdir logs

# download cpp-ethereum if needed
cd ethereum
[ ! -d "cpp-ethereum" ] && git clone --depth=1 --branch develop https://github.com/ethereum/cpp-ethereum

# download and build ethereum's dependencies
cd ~/opt
if [ ! -d "cryptopp562" ]; then
  mkdir cryptopp562
  cd cryptopp562
  wget http://www.cryptopp.com/cryptopp562.zip
  unzip cryptopp562.zip
  CXX="g++ -fPIC" make
  make dynamic
  sudo make install
fi

# build ethereum
cd ~/opt
mkdir cpp-ethereum-build
cd cpp-ethereum-build
cmake ~/ethereum/cpp-ethereum -DCMAKE_BUILD_TYPE=Debug
make

# build alethzero GUI client
mkdir alethzero
cd alethzero
qmake ~/ethereum/cpp-ethereum/alethzero
make

# now let's create bin folder in user's home dir and create symlinks to executables
cd ~
ln -s ~/opt/cpp-ethereum-build/alethzero/alethzero ~/bin/alethzero
ln -s ~/opt/cpp-ethereum-build/eth/eth ~/bin/eth

# install cloud-utils to fetch instance meta-data
sudo apt-get -y install cloud-utils
EC2_INSTANCE_ID=$(ec2metadata --instance-id)
ETH_VERSION=$(eth -V)

# add node service
cd ~/bin
[ ! -d "www" ] && git clone https://github.com/cubedro/eth-net-intelligence-api www
cd www
sudo npm install pm2 -g
sudo npm install

pm2 start processes.json
pm2 startup ubuntu
pm3 save