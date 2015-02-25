Ethereum Network Intelligence API
============

Deploy on AWS, install dependencies, build eth, clone eth-net-intelligence-api and run as services forever

```
curl https://raw.githubusercontent.com/cubedro/eth-net-intelligence-api/master/bin/build.sh | sh
```

Run it using pm2:

```
cd ~/bin/www
pm2 start processes.json
```