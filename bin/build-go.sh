#!/bin/sh

# update repository & install dependencies
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y git mercurial build-essential software-properties-common wget pkg-config libgmp3-dev libreadline6-dev libpcre3-dev libpcre++-dev nodejs npm ntp

# add ethereum repos
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo add-apt-repository -y ppa:ethereum/ethereum-dev
sudo apt-get update -y

# install ethereum
sudo apt-get install -y geth

# add node symlink
sudo ln -s /usr/bin/nodejs /usr/bin/node

# install cloud-utils to fetch instance meta-data
sudo apt-get -y install cloud-utils

# add node service
cd ~/bin

[ ! -d "www" ] && git clone https://github.com/cubedro/eth-net-intelligence-api www
cd www
npm install
npm install pm2 -g

cp -b ./processes-go.json ./../processes.json

# set up time update cronjob
cat > /etc/cron.hourly/ntpdate << EOF
#!/bin/sh
sudo service ntp stop
sudo ntpdate -s ntp.ubuntu.com
sudo service ntp start
EOF

sudo chmod 755 /etc/cron.hourly/ntpdate
