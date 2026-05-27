FROM node:22-alpine

WORKDIR /app

# Install dependencies required for sharp/bcrypt if needed, and git
RUN apk add --no-cache python3 make g++ git

# Copy package files
COPY package*.json ./

# Clean install
RUN npm ci

# Copy the rest of the application
COPY . .

# Environment will be provided by docker-compose .env.local mount
# Default command is overridden in docker-compose.yml to run startWorker.ts
CMD ["npm", "start"]
