# Nexo InOuty web app — production image
#   docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t nexo-web .
#   docker run -p 3000:3000 nexo-web
# The API address is built into the app: build one image per environment.

# 1. Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL=""
ARG NEXT_PUBLIC_SUPPORT_PHONE=""
ARG NEXT_PUBLIC_SUPPORT_WHATSAPP=""
ARG NEXT_PUBLIC_SUPPORT_HOURS=""
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL \
    NEXT_PUBLIC_SUPPORT_PHONE=$NEXT_PUBLIC_SUPPORT_PHONE \
    NEXT_PUBLIC_SUPPORT_WHATSAPP=$NEXT_PUBLIC_SUPPORT_WHATSAPP \
    NEXT_PUBLIC_SUPPORT_HOURS=$NEXT_PUBLIC_SUPPORT_HOURS \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 2. Run
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/signin" > /dev/null || exit 1
CMD ["npx", "next", "start"]
