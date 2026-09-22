FROM node:20-alpine AS deps
WORKDIR /app
COPY apps/api/package.json ./apps/api/package.json
COPY package.json ./
RUN npm install --workspace=@sales-os/api --include-workspace-root=false 2>/dev/null || (cd apps/api && npm install)

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
COPY --from=deps /app/apps/api/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main.js"]
