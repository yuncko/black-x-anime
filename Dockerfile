# Hearbor — production image (SnapDeploy, Render, Railway, Koyeb, Fly, any Docker host)
# Node 22 matches package.json "engines" (Node 20 is end-of-life).
FROM node:22-slim

# build tools for better-sqlite3 + PostgreSQL for the social/gamification API
# (openssl is required by the Prisma query engine on slim images)
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ postgresql postgresql-client openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
# The Prisma postinstall hook ran before prisma/schema.prisma was copied,
# so generate the client now — otherwise the Prisma-backed API stays a stub.
RUN npx prisma generate && npm run build && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=4001
EXPOSE 4001

# entrypoint boots an ephemeral postgres + prisma db push, then runs the app
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
