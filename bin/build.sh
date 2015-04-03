#!/bin/sh

echo "You're about to install ethereum. Please choose one of the following:"
echo "1. eth"
echo "2. geth"
while true; do
    read -p "Choose the implementation: " imp
    case $imp in
        [1]* ) ethtype="eth"; break;;
        [2]* ) ethtype="geth"; break;;
        * ) echo "Please answer 1 or 2.";;
    esac
done

echo "Installing" $ethtype

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
sudo apt-get install -y software-properties-common build-essential git unzip wget nodejs npm ntp cloud-utils $ethtype

# add node symlink if it doesn't exist
[[ ! -f /usr/bin/node ]] && sudo ln -s /usr/bin/nodejs /usr/bin/node

# add node service
cd ~/bin

[ ! -d "www" ] && git clone https://github.com/cubedro/eth-net-intelligence-api www
cd www
git pull
npm install
sudo npm install pm2 -g

[[ ! -f ~/bin/processes.json ]] && cp -b ./processes.json ./..

# set up time update cronjob
sudo bash -c "cat > /etc/cron.hourly/ntpdate << EOF
#!/bin/sh
sudo service ntp stop
sudo ntpdate -s ntp.ubuntu.com
sudo service ntp start
EOF"

sudo chmod 755 /etc/cron.hourly/ntpdate
