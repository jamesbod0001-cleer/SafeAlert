# Public ECR mirror avoids Docker Hub rate limits in CodeBuild/App Runner
FROM public.ecr.aws/docker/library/node:20-alpine AS base
WORKDIR /app

ARG CACHEBUST=1

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN head -6 src/server.js && grep -q "const path" src/server.js
RUN NODE_ENV=production USE_MEMORY_DB=true node -e "require('./src/routes/index'); console.log('routes-ok')"
COPY public ./public
COPY data ./data
COPY firestore.indexes.json ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "--trace-uncaught", "src/server.js"]
