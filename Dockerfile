FROM node:8

COPY ./ /opt/innovate-hub

WORKDIR /opt/innovate-hub

RUN npm install

CMD node /opt/innovate-hub/source/main.js