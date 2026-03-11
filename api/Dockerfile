FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Cloud Run sets PORT automatically; default to 3001 locally
ENV PORT=3001

EXPOSE 3001

CMD ["node", "index.js"]
