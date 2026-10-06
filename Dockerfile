FROM node:20-alpine
WORKDIR /app
COPY package.json server.js index.html ./
ENV NODE_ENV=production DATA_DIR=/data
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
HEALTHCHECK CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
