FROM ghcr.io/puppeteer/puppeteer:23.11.1

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "index.js"]
