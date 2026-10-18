# Imagen de producción: Node.js 22 sin dependencias adicionales.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production PORT=8080 DATA_DIR=/var/data TRUST_PROXY=1
RUN mkdir -p /var/data && chown node:node /var/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "--no-warnings", "server/server.js"]
