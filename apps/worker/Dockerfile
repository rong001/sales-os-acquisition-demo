FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/worker/package.json ./package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/worker ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules
CMD ["node", "dist/main.js"]
