FROM node:26-alpine

RUN apk update && apk upgrade && \
    apk add --no-cache git

WORKDIR /home/node/app

COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

CMD [ "node", "index.js" ]