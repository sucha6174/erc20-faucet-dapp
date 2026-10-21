FROM node:20-alpine

# Install curl for docker healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Install dependencies first for efficient layer caching
COPY package*.json ./
RUN npm install

# Copy source code and build production assets
COPY . .
RUN npm run build

EXPOSE 3000

# Start production server serving dist with /health
CMD ["npm", "run", "start"]
