#!/bin/sh

cd ~

[ ! -d "bin" ] && mkdir bin
[ ! -d "logs" ] && mkdir logs

# update packages
sudo apt-get update -y
sudo apt-get upgrade -y

# add ethereum repos
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo add-apt-repository -y ppa:ethereum/ethereum-dev
sudo apt-get update -y

# install ethereum & install dependencies
sudo apt-get install -y software-properties-common build-essential git unzip wget nodejs npm ntp cloud-utils geth

# remove previous eth symlink
[[ ! -f ~/bin/geth ]] && rm ~/bin/geth
# add eth symlink
ln -s  /usr/bin/geth ~/bin/geth

# add node symlink if it doesn't exist
[[ ! -f /usr/bin/node ]] && sudo ln -s /usr/bin/nodejs /usr/bin/node

# add node service
cd ~/bin

[ ! -d "www" ] && git clone https://github.com/cubedro/eth-net-intelligence-api www
cd www
git pull
npm install
npm install pm2 -g

[[ ! -f ~/bin/processes.json ]] && cp -b ./processes.json ./..

# set up time update cronjob
cat > /etc/cron.hourly/ntpdate << EOF
#!/bin/sh
sudo service ntp stop
sudo ntpdate -s ntp.ubuntu.com
sudo service ntp start
EOF

sudo chmod 755 /etc/cron.hourly/ntpdate
