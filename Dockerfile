## Stage 1: Build
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

## Stage 2: Serve
FROM nginx:alpine

LABEL maintainer="renesenses"
LABEL description="Tune Web Client - Web interface for Tune Server"

# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config
COPY nginx/tune-web-client.conf /etc/nginx/conf.d/tune-web-client.conf

# Copy built static files
COPY --from=build /app/dist /usr/share/tune-web-client

# Default: tune-server at host machine
# Override with: docker run -e TUNE_SERVER_HOST=<ip>
ENV TUNE_SERVER_HOST=host.docker.internal

# Rewrite nginx upstream at startup
RUN printf '#!/bin/sh\n\
sed -i "s/127.0.0.1:8888/${TUNE_SERVER_HOST}:8888/g" /etc/nginx/conf.d/tune-web-client.conf\n\
exec nginx -g "daemon off;"\n' > /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

EXPOSE 8080

CMD ["/docker-entrypoint.sh"]
