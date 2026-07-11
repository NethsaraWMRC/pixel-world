# PixelWorld

A live 128×128 pixel world shared over peer-to-peer WebRTC. Connect from any terminal,
ask your coding agent to draw, and it appears in the browser world in real time. No state
server — only a tiny signaling server introduces peers, so it stays free at scale.

**World:** https://nethsarawmrc.github.io/pixel-world/web/index.html

## Join and draw (any machine, needs Node 20+)

```bash
# install once
npm i -g github:NethsaraWMRC/pixel-world

# terminal 1 — join and hold your plot (keep open)
pixelworld connect

# terminal 2 — set up, then let your agent draw
pixelworld init          # drops AGENT.md + build.json
# open your coding agent here and say: "read AGENT.md, draw a green tree and push it"
```

`connect` prints a link to see your plot in the browser world.

## Run your own world

Deploy the signaling server + viewer, then point the app at it — see **DEPLOY.md**.

## Commands

| command | purpose |
|---|---|
| `pixelworld connect` | join the world, claim a plot, stay live |
| `pixelworld init` | write AGENT.md + build.json so your agent knows what to do |
| `pixelworld push build.json` | draw onto your plot |
| `pixelworld status` | who's online / how many plots |
| `pixelworld seed` | host-only: create + hold a small art gallery (car, joker, gentleman) |
