#!/bin/sh

cd ~

mkdir bin
mkdir logs

# let's install packages
sudo apt-get -y update
sudo apt-get -y upgrade

# Setup Ethereum repos
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo add-apt-repository -y ppa:ethereum/ethereum-dev
sudo apt-get -y update

sudo apt-get -y install software-properties-common build-essential git unzip wget nodejs npm ntp cloud-utils eth

# add eth symlink
ln -s /usr/bin/eth ~/bin/eth

# add node symlink
sudo ln -s /usr/bin/nodejs /usr/bin/node

# add node service
cd ~/bin

[ ! -d "www" ] && git clone https://github.com/cubedro/eth-net-intelligence-api www
cd www
npm install
npm install pm2 -g

cp -b ./processes.json ./..

# set up time update cronjob
cat > /etc/cron.hourly/ntpdate << EOF
#!/bin/sh
sudo service ntp stop
sudo ntpdate -s ntp.ubuntu.com
sudo service ntp start
EOF

sudo chmod 755 /etc/cron.hourly/ntpdate
