FROM node:18-slim

# Install Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libxss1 \
    libgtk-3-0 \
    libgbm-dev \
    git \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Force git to use HTTPS instead of SSH
RUN git config --global url."https://github.com/".insteadOf git@github.com:

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

CMD ["npm", "run", "dev"]
