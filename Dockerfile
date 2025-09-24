# syntax=docker/dockerfile:1
FROM node:lts

# Install Chromium for headless browser testing
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium

WORKDIR /usr/src/app

# Copy repository contents into the container
COPY . .

# Install dependencies for the web extension package
RUN cd packages/web-extension && npm install

# Default working directory for runtime commands
WORKDIR /usr/src/app/packages/web-extension

# Run the interactive demo by default when the container starts
CMD ["npm", "run", "demo"]
