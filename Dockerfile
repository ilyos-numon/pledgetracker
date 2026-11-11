# Static SPA image: Vite build, served by unprivileged nginx. Build and run (from the project root):
#   scripts/sb-env.sh sh -c 'docker build --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" -t pledgetracker:local .'
#   docker run --rm -p 8868:8080 pledgetracker:local
# The two build args are public values (Supabase URL and anon/publishable key); they end up
# in the browser bundle anyway, so they are build args, not secrets. The build fails if either is empty.
# Health check endpoint: /health (Cloud Run does not pass /healthz to the app).
# Only `vite build` runs here: tsc also checks scripts/ and tests/, which are not in the image (CI runs tsc).

# The output is static files, so the build stage runs natively on the build host (no emulation).
FROM --platform=$BUILDPLATFORM node:24-alpine AS build

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY"

WORKDIR /app

# Dependencies first (cached until the lock file changes). Dev dependencies hold vite itself.
COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY tsconfig.json vite.config.ts postcss.config.cjs ./
COPY src ./src
COPY web ./web
RUN npx vite build


FROM nginxinc/nginx-unprivileged:1.28-alpine

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 8080
# CMD is the base image default (nginx in the foreground, uid 101).
