Ethereum Network Intelligence API
============
[![Build Status][travis-image]][travis-url] [![dependency status][dep-image]][dep-url]

Deploy on AWS, install dependencies, build eth, clone eth-net-intelligence-api and run as services forever

```
curl https://raw.githubusercontent.com/cubedro/eth-net-intelligence-api/master/bin/build.sh | sh
```

Run it using pm2:

```
cd ~/bin/www
pm2 start processes.json
```

[travis-image]: https://travis-ci.org/cubedro/eth-net-intelligence-api.svg
[travis-url]: https://travis-ci.org/cubedro/eth-net-intelligence-api
[dep-image]: https://david-dm.org/cubedro/eth-net-intelligence-api.svg
[dep-url]: https://david-dm.org/cubedro/eth-net-intelligence-api