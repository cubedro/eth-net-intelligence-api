#!/bin/sh

mkdir -p ~/go
echo "export GOPATH=$HOME/go" >> ~/.bashrc
echo "export PATH=$PATH:$HOME/go/bin:/usr/local/go/bin" >> ~/.bashrc

export GOPATH=$HOME/go
export PATH=$PATH:$HOME/go/bin:/usr/local/go/bin

sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y git mercurial build-essential software-properties-common wget pkg-config libgmp3-dev libreadline6-dev libpcre3-dev libpcre++-dev nodejs npm

# install go
sudo apt-get install -y golang

go get -v github.com/tools/godep
go get -v -d github.com/ethereum/go-ethereum/...

# install ethereum go
cd $GOPATH/src/github.com/ethereum/go-ethereum
git checkout develop
godep restore
go install -v ./cmd/ethereum

# add node symlink
sudo ln -s /usr/bin/nodejs /usr/bin/node

# install cloud-utils to fetch instance meta-data
sudo apt-get -y install cloud-utils

# add node service
cd ~/bin

[ ! -d "www" ] && git clone https://github.com/cubedro/eth-net-intelligence-api www
cd www
sudo npm install
sudo npm install pm2 -g

cp -b ./processes-go.json ./../processes.json
