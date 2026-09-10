FROM oven/bun:1.4.0-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json ./
COPY web ./web
COPY shared ./shared
COPY public ./public
RUN bun run build

FROM oven/bun:1.4.0-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production BIND_ADDRESS=0.0.0.0 DATA_DIR=/data PORT=4310
EXPOSE 4310
CMD ["bun", "server/index.ts"]
