FROM node:20-slim

WORKDIR /app

# Install ALL dependencies (including dev for build)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build TypeScript (backend only)
RUN npm run build:server

# Remove dev dependencies after build
RUN npm prune --production

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
