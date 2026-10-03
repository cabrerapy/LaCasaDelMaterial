FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run build --workspace @lcm/contracts && npm run build --workspace @lcm/api

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@lcm/api"]
