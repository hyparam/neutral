ARG BASE_IMAGE=node:22-bookworm-slim
FROM ${BASE_IMAGE}
USER root
RUN if ! command -v tmux >/dev/null || ! command -v setpriv >/dev/null || ! command -v tini >/dev/null; then apt-get update && apt-get install -y --no-install-recommends tmux util-linux tini procps && rm -rf /var/lib/apt/lists/*; fi
RUN (id neutral >/dev/null 2>&1 || useradd -m -s /bin/bash neutral) && mkdir -p /work/a /var/lib/neutral-safety && chown -R neutral:neutral /work && chmod 700 /var/lib/neutral-safety
COPY . /opt/neutral
RUN chown -R root:root /opt/neutral && chmod -R go-w /opt/neutral && \
    cp /opt/neutral/docker/test-fixtures/safety/prepare.sh /opt/neutral/docker/prepare.sh && \
    ln -sf /opt/neutral/bin/neutral.js /usr/local/bin/neutral && \
    ln -sf /opt/neutral/docker/test-fixtures/safety/service.js /usr/local/bin/hyp && \
    ln -sf /opt/neutral/docker/test-fixtures/safety/service.js /usr/local/bin/claude && \
    chmod +x /opt/neutral/docker/test-fixtures/safety/service.js /opt/neutral/docker/prepare.sh
ENV SLACK_BOT_TOKEN="" SLACK_CHANNEL_ID="" GH_TOKEN="" CLAUDE_CODE_OAUTH_TOKEN="" ANTHROPIC_API_KEY="" HYP_REMOTE_TOKEN="" NEUTRAL_MAYOR="0" NEUTRAL_SENTINEL="0"
ENV NEUTRAL_REPOS="owner/a" NEUTRAL_WATCHDOG="0" NEUTRAL_HYPAWARE="1" NEUTRAL_SAFETY_SOCKET="/run/neutral-safety/client.sock"
WORKDIR /work
ENTRYPOINT ["/opt/neutral/docker/entrypoint.sh"]
