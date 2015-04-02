#!/bin/sh

cd ~

# let's install packages
sudo apt-get -y update
sudo apt-get -y install language-pack-en-base
sudo dpkg-reconfigure locales
sudo apt-get -y install software-properties-common
wget -O - http://llvm.org/apt/llvm-snapshot.gpg.key | sudo apt-key add -
sudo add-apt-repository "deb http://llvm.org/apt/trusty/ llvm-toolchain-trusty-3.5-binaries main"

# Setup Ethereum repos
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo add-apt-repository -y ppa:ethereum/ethereum-dev
sudo apt-get -y update
sudo apt-get -y upgrade

sudo apt-get -y install build-essential g++-4.8 git cmake libboost-all-dev automake unzip libgmp-dev libtool libleveldb-dev yasm libminiupnpc-dev libreadline-dev scons libncurses5-dev libcurl4-openssl-dev wget qtbase5-dev qt5-default qtdeclarative5-dev libqt5webkit5-dev libcryptopp-dev libjson-rpc-cpp-dev libmicrohttpd-dev libjsoncpp-dev libargtable2-dev clang-3.5 lldb-3.5 nodejs npm

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

# build ethereum
cd ~/opt
mkdir cpp-ethereum-build
cd cpp-ethereum-build
cmake ~/ethereum/cpp-ethereum -DHEADLESS=1 -DCMAKE_BUILD_TYPE=Debug
# cmake ~/ethereum/cpp-ethereum -DHEADLESS=1 -DEVMJIT=1 -DCMAKE_BUILD_TYPE=Debug
make -j2

# now let's create bin folder in user's home dir and create symlinks to executables
cd ~
ln -s ~/opt/cpp-ethereum-build/eth/eth ~/bin/eth

# install cloud-utils to fetch instance meta-data
sudo apt-get -y install cloud-utils

# add node service
cd ~/bin

[ ! -d "www" ] && git clone https://github.com/cubedro/eth-net-intelligence-api www
cd www
npm install
npm install pm2 -g

cp -b ./processes.json ./..
