FROM node:10-alpine

RUN apk --update --no-cache add git

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn

COPY . .

CMD ["npm", "start"]
