FROM alpine:3.19

RUN apk add --no-cache \
    postgresql16-client \
    curl \
    gzip \
    tzdata

COPY backup.sh /backup.sh
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /backup.sh /entrypoint.sh

# Create log file
RUN touch /var/log/backup.log

ENV TZ=UTC

ENTRYPOINT ["/entrypoint.sh"]
