# v0.8.9-rc1

# Base node image
FROM node:24.22.1-alpine AS node

ARG ALPINE_MIRROR=
RUN if [ -n "$ALPINE_MIRROR" ]; then sed -i "s|https://dl-cdn.alpinelinux.org/alpine|${ALPINE_MIRROR}|g" /etc/apk/repositories; fi
RUN apk upgrade --no-cache
RUN apk add --no-cache bash jemalloc
RUN apk add --no-cache python3 py3-pip uv

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2
# Disable dependency installation analytics before any npm lifecycle scripts run.
ENV SCARF_ANALYTICS=false

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.9.5-python3.12-alpine /usr/local/bin/uv /usr/local/bin/uvx /bin/
RUN uv --version

# Set configurable max-old-space-size with default
ARG NODE_MAX_OLD_SPACE_SIZE=6144
ARG NPM_CI_TIMEOUT_SECONDS=1500
ARG NPM_CI_ATTEMPTS=2
ARG NPM_REGISTRY=

RUN mkdir -p /app && chown node:node /app
WORKDIR /app

USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node api/package.json ./api/package.json
COPY --chown=node:node client/package.json ./client/package.json
COPY --chown=node:node packages/data-provider/package.json ./packages/data-provider/package.json
COPY --chown=node:node packages/data-schemas/package.json ./packages/data-schemas/package.json
COPY --chown=node:node packages/api/package.json ./packages/api/package.json
COPY --chown=node:node vendor/code ./vendor/code
COPY --chown=node:node packages/chat/package.json ./packages/chat/package.json

RUN \
    # Allow mounting of these files, which have no default
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/logs /app/uploads /app/skill /app/data ; \
    chmod 1777 /app/data ; \
    if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    attempt=1 ; \
    until timeout "$NPM_CI_TIMEOUT_SECONDS" npm ci --no-audit ; do \
        status=$? ; \
        if [ "$attempt" -ge "$NPM_CI_ATTEMPTS" ]; then \
            exit "$status" ; \
        fi ; \
        echo "npm ci --no-audit failed with exit code $status; retrying attempt $((attempt + 1))/$NPM_CI_ATTEMPTS" ; \
        attempt=$((attempt + 1)) ; \
        npm cache clean --force || true ; \
        sleep 10 ; \
    done

COPY --chown=node:node . .

ARG VITE_MCP_SANDBOX_URL=
ARG VITE_CODECHAT_API_ORIGIN=
ARG VITE_CODECHAT_DEFAULT_LANGUAGE=
ARG CODECHAT_VERIFY=false
RUN \
    # React client build with configurable memory
    NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" npm run frontend && \
    if [ "$CODECHAT_VERIFY" = "true" ]; then \
      npx eslint packages/api/src/user/templates.ts packages/api/src/user/templates.spec.ts packages/data-provider/src/codechatTemplates.ts client/src/components/CodeChat/Templates.tsx client/src/components/CodeChat/Templates.spec.tsx && \
      (cd packages/api && npx jest src/user/templates.spec.ts --runInBand --coverage=false) && \
      (cd client && npx jest src/components/CodeChat/Templates.spec.tsx --runInBand --coverage=false) && \
      npx eslint client/src/components/CodeChat/Payment.tsx client/src/components/CodeChat/Payment.spec.tsx && \
      (cd client && npx jest src/components/CodeChat/Payment.spec.tsx --runInBand --coverage=false) && \
      npx eslint packages/api/src/user/projects.ts packages/api/src/user/projects.spec.ts packages/data-provider/src/codechatProjects.ts client/src/components/CodeChat/Projects.tsx client/src/components/CodeChat/Projects.spec.tsx client/src/components/CodeChat/Workbench.tsx && \
      (cd packages/api && npx jest src/user/projects.spec.ts --runInBand --coverage=false) && \
      (cd client && npx jest src/components/CodeChat/Projects.spec.tsx --runInBand --coverage=false) && \
      npx eslint client/src/components/CodeChat/Provenance.tsx client/src/components/CodeChat/Provenance.spec.tsx && \
      (cd client && npx jest src/components/CodeChat/Provenance.spec.tsx --runInBand --coverage=false) && \
      npx eslint client/src/components/CodeChat/Acceptance.tsx client/src/components/CodeChat/Acceptance.spec.tsx client/src/components/CodeChat/evidence.ts && \
      (cd client && npx jest src/components/CodeChat/Acceptance.spec.tsx --runInBand --coverage=false) && \
      npx eslint client/src/components/CodeChat/delivery.ts client/src/components/CodeChat/Delivery.tsx client/src/components/CodeChat/Publication.tsx && \
      npx eslint packages/api/src/user/versions.ts packages/api/src/user/versions.spec.ts packages/data-provider/src/codechatVersions.ts client/src/components/CodeChat/Versions.tsx client/src/components/CodeChat/Versions.spec.tsx && \
      (cd packages/api && npx jest src/user/versions.spec.ts --runInBand --coverage=false) && \
      (cd client && npx jest src/components/CodeChat/Versions.spec.tsx --runInBand --coverage=false) && \
      npx eslint packages/api/src/user/workbench.ts packages/api/src/user/workbench.spec.ts packages/data-provider/src/workbench.ts client/src/components/CodeChat/Workbench.tsx client/src/components/CodeChat/NewFolder.tsx client/src/components/Chat/Menus/Endpoints/ModelSelector.tsx && \
      (cd packages/api && npx jest src/user/workbench.spec.ts src/user/taskStream.spec.ts src/user/accountAccess.spec.ts src/auth/codeapi.spec.ts --runInBand --coverage=false) && \
      npx eslint client/src/components/CodeChat/Task.tsx client/src/components/CodeChat/TaskActivity.tsx client/src/components/CodeChat/Task.spec.tsx packages/api/src/user/taskStream.ts packages/api/src/user/taskStream.spec.ts client/src/components/Chat/Messages/Content/Markdown.tsx && \
      npx eslint client/src/hooks/Messages/useMessageScrolling.ts client/src/hooks/Messages/__tests__/useMessageScrolling.spec.tsx && \
      (cd client && npx jest src/hooks/Messages/__tests__/useMessageScrolling.spec.tsx --runInBand --coverage=false) && \
      npx eslint client/src/components/CodeChat/MCP.tsx client/src/components/CodeChat/MCP.spec.tsx client/src/components/CodeChat/MCPCredential.tsx && \
      (cd client && npx jest src/components/CodeChat/Task.spec.tsx src/components/CodeChat/MCP.spec.tsx --runInBand --coverage=false) && \
      npx eslint client/src/components/Chat/Input/__tests__/ChatForm.attachments.spec.tsx client/src/store/language.ts client/src/locales/Translation.spec.ts client/src/components/CodeChat/Membership.tsx client/src/components/CodeChat/Membership.spec.tsx client/src/components/Chat/Input/Composer/Bar.tsx client/src/locales/i18n.ts packages/api/src/endpoints/custom/initialize.ts packages/api/src/endpoints/openai/config.ts packages/api/src/types/http.ts packages/api/src/user/workspace.ts packages/data-provider/src/codechat.ts packages/data-provider/src/schemas.ts packages/data-provider/src/types.ts packages/data-schemas/src/methods/conversation.ts packages/data-schemas/src/schema/defaults.ts packages/data-schemas/src/types/convo.ts && \
      (cd packages/data-schemas && NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit) && \
      npx eslint packages/api/src/user/databases.ts packages/api/src/user/databases.spec.ts packages/data-provider/src/codechatDatabases.ts client/src/components/CodeChat/Databases.tsx client/src/components/CodeChat/Databases.spec.tsx client/src/components/CodeChat/Applications.tsx client/src/components/CodeChat/Applications.spec.tsx && \
      npx eslint packages/api/src/user/capacity.ts packages/api/src/user/capacity.spec.ts api/server/routes/user.js packages/data-provider/src/codechatCapacity.ts packages/data-provider/src/keys.ts client/src/components/CodeChat/Capacity.tsx client/src/components/CodeChat/Capacity.spec.tsx client/src/components/CodeChat/storage.ts packages/client/src/components/Tabs.tsx packages/data-provider/src/codechatCapabilities.ts packages/data-provider/src/config.ts packages/data-provider/src/index.ts client/src/components/CodeChat/Capabilities.tsx client/src/components/CodeChat/Capabilities.spec.tsx client/src/components/CodeChat/Space.tsx client/src/components/CodeChat/Space.spec.tsx client/src/components/CodeChat/Files.tsx client/src/components/Chat/Header.tsx client/src/components/Chat/Input/ChatForm.tsx client/src/components/UnifiedSidebar/ConversationsSection.tsx && \
      (cd api && npx jest server/services/CodeChatModelKey.spec.js server/middleware/__tests__/requireJwtAuth.spec.js --runInBand --coverage=false) && \
      (cd packages/data-provider && npx tsc --noEmit) && \
      (cd client && npx jest src/components/CodeChat/StorageSummary.spec.tsx src/components/Chat/Presentation.test.tsx --runInBand --coverage=false) && \
      (cd packages/client && NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit && npx jest src/components/__tests__/dialogPlacement.spec.tsx --runInBand --coverage=false) && \
      (cd packages/api && NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit && npx jest src/user/codeChatIdentity.spec.ts src/user/workspace.spec.ts src/user/capacity.spec.ts src/user/databases.spec.ts --runInBand --coverage=false) && \
      (cd client && NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit && npx jest src/components/Chat/Input/__tests__/ChatForm.attachments.spec.tsx src/locales/Translation.spec.ts src/components/CodeChat/identity.spec.ts src/components/CodeChat/SpaceStatus.spec.tsx src/components/CodeChat/Files.spec.tsx src/components/CodeChat/Applications.spec.tsx src/components/CodeChat/Capabilities.spec.tsx src/components/CodeChat/Space.spec.tsx src/components/CodeChat/Capacity.spec.tsx src/components/CodeChat/Membership.spec.tsx src/components/CodeChat/Databases.spec.tsx src/components/CodeChat/SaveToSpace.spec.tsx src/components/Messages/Content/__tests__/RunCode.test.tsx --runInBand --coverage=false); \
    fi && \
    npm prune --production && \
    npm cache clean --force

# Optional build metadata surfaced in Settings -> About for support triage.
# Declared here (after the heavy install/build steps) so that commit/date
# changing on every CI run does not bust the cache for dependency install
# and frontend build layers. When unset, the backend falls back to local
# git resolution (if .git is present), and finally to empty values.
ARG BUILD_COMMIT=
ARG BUILD_BRANCH=
ARG BUILD_DATE=
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV BUILD_BRANCH=${BUILD_BRANCH}
ENV BUILD_DATE=${BUILD_DATE}

# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["npm", "run", "backend"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]
