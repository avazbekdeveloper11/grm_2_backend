FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/gilam.db

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "--experimental-sqlite", "server.js"]
