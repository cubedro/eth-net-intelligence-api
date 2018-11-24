## Dockerfile for etc-net-intelligence-api (build from git).
##
## Build via:
#
# `docker build -t etcnetintel:latest .`
#
## Run via:
#
# `docker run -v <path to app.json>:/home/etcnetintel/etc-net-intelligence-api/app.json etcnetintel:latest`
#
## Make sure, to mount your configured 'app.json' into the container at
## '/home/etcnetintel/etc-net-intelligence-api/app.json', e.g.
## '-v /path/to/app.json:/home/etcnetintel/etc-net-intelligence-api/app.json'
## 
## Note: if you actually want to monitor a client, you'll need to make sure it can be reached from this container.
##       The best way in my opinion is to start this container with all client '-p' port settings and then 
#        share its network with the client. This way you can redeploy the client at will and just leave 'etcnetintel' running. E.g. with
##       the python client 'pyethapp':
##
#
# `docker run -d --name etcnetintel \
# -v /home/user/app.json:/home/etcnetintel/etc-net-intelligence-api/app.json \
# -p 0.0.0.0:30303:30303 \
# -p 0.0.0.0:30303:30303/udp \
# etcnetintel:latest`
#
# `docker run -d --name pyethapp \
# --net=container:etcnetintel \
# -v /path/to/data:/data \
# pyethapp:latest`
#
## If you now want to deploy a new client version, just redo the second step.


FROM debian

RUN apt-get update &&\
    apt-get install -y curl git-core &&\
    curl -sL https://deb.nodesource.com/setup | bash - &&\
    apt-get update &&\
    apt-get install -y nodejs

RUN apt-get update &&\
    apt-get install -y build-essential

RUN adduser etcnetintel

RUN cd /home/etcnetintel &&\
    git clone https://github.com/Machete3000/etc-net-intelligence-api &&\
    cd etc-net-intelligence-api &&\
    npm install &&\
    npm install -g pm2

RUN echo '#!/bin/bash\nset -e\n\ncd /home/etcnetintel/etc-net-intelligence-api\n/usr/local/lib/node_modules/pm2/bin/pm2 start ./app.json\ntail -f \
    /home/etcnetintel/.pm2/logs/node-app-out-0.log' > /home/etcnetintel/startscript.sh

RUN chmod +x /home/etcnetintel/startscript.sh &&\
    chown -R etcnetintel. /home/etcnetintel

USER etcnetintel
ENTRYPOINT ["/home/etcnetintel/startscript.sh"]
