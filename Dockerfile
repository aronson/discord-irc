FROM denoland/deno AS builder
WORKDIR /app

COPY . .

RUN apt update && apt install unzip
RUN deno task prepare

FROM debian:stable-slim
WORKDIR /app

COPY --from=builder /app/discord-irc .

ENTRYPOINT ["/app/discord-irc"]
