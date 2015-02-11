eth-netstatsservice
============

Ethereum Network Stats Service

To run via Docker

create a docker image via

```
docker build --tag="eth-netstatsservice" path/to/eth-netstatsservice-repo
```

run it via

```
docker run --publish=3000:3000 eth-netstatsservice
```

see the interface at http://localhost:3000
