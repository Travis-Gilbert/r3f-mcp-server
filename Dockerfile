FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
COPY scenes/ ./scenes/

RUN npm run build

ENV TRANSPORT=http
ENV SCENES_DIR=/app/scenes

EXPOSE 3000

CMD ["node", "dist/index.js"]
