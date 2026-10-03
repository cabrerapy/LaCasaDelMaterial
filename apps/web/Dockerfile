FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN npm run build --workspace @lcm/contracts

EXPOSE 4200
CMD ["npm", "run", "start", "--workspace", "@lcm/web", "--", "--proxy-config", "proxy.docker.conf.json"]
