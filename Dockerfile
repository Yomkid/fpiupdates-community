FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json backend/
RUN cd backend && npm ci
COPY backend/ backend/
RUN cd backend && npm run prisma:generate && npm run build
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
RUN cd frontend && npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/backend /app/backend
COPY --from=build --chown=node:node /app/frontend/dist /app/frontend/dist
RUN mkdir -p /app/backend/.uploads && chown node:node /app/backend/.uploads
USER node
WORKDIR /app/backend
ENV NODE_ENV=production SERVE_FRONTEND=true PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && node dist/main.js"]
