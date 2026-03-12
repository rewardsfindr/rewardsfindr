FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Do NOT set PORT here — Cloud Run injects PORT=8080 at runtime
# Locally it falls back to 3001 via process.env.PORT || 3001 in index.js
EXPOSE 8080

CMD ["node", "index.js"]
