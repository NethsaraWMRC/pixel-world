// PixelWorld signaling on Cloudflare Workers + Durable Object.
// One Durable Object instance per room holds ALL peer WebSockets, so signaling state
// is coherent (unlike multi-isolate serverless). Speaks the y-webrtc protocol.

export class SignalRoom {
  constructor(state, env) {
    this.topics = new Map();      // topic -> Set<WebSocket>
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const subscribed = new Set();

    server.addEventListener("message", (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m || !m.type) return;

      switch (m.type) {
        case "subscribe":
          (m.topics || []).forEach((t) => {
            if (typeof t !== "string") return;
            let s = this.topics.get(t);
            if (!s) { s = new Set(); this.topics.set(t, s); }
            s.add(server);
            subscribed.add(t);
          });
          break;
        case "unsubscribe":
          (m.topics || []).forEach((t) => {
            const s = this.topics.get(t);
            if (s) s.delete(server);
          });
          break;
        case "publish":
          if (m.topic) {
            const s = this.topics.get(m.topic);
            if (s) {
              m.clients = s.size;
              const data = JSON.stringify(m);
              for (const c of s) { try { c.send(data); } catch { /* drop */ } }
            }
          }
          break;
        case "ping":
          try { server.send(JSON.stringify({ type: "pong" })); } catch { /* drop */ }
          break;
      }
    });

    const cleanup = () => {
      for (const t of subscribed) {
        const s = this.topics.get(t);
        if (s) { s.delete(server); if (s.size === 0) this.topics.delete(t); }
      }
    };
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    if (request.headers.get("Upgrade") === "websocket") {
      const id = env.ROOM.idFromName("pixelworld-signal"); // single shared room
      return env.ROOM.get(id).fetch(request);
    }
    return new Response("okay", { headers: { "content-type": "text/plain" } });
  },
};
