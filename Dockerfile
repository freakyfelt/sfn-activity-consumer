FROM node:16-alpine

WORKDIR /app

COPY package.json package-lock.json /app/
RUN npm install
