// PixelMesh signaling server for Deno Deploy (free, no card, always-on).
// Speaks the y-webrtc signaling protocol (subscribe / unsubscribe / publish / ping).
// Deno Deploy runs many edge isolates; a client on isolate A must still reach a client
// on isolate B. BroadcastChannel fans published messages across all isolates.

type Sock = WebSocket & { topics?: Set<string> };

const local = new Map<string, Set<Sock>>();      // topic -> sockets on THIS isolate
const relay = new BroadcastChannel("pixelmesh-signal");

// deliver a raw message string to this isolate's subscribers of `topic`
function deliverLocal(topic: string, data: string) {
  const subs = local.get(topic);
  if (!subs) return;
  for (const ws of subs) {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(data); } catch { /* drop */ }
  }
}

// messages published on other isolates arrive here
relay.onmessage = (e: MessageEvent) => {
  const { topic, data } = e.data as { topic: string; data: string };
  deliverLocal(topic, data);
};

function subscribe(ws: Sock, topic: string) {
  if (typeof topic !== "string") return;
  let subs = local.get(topic);
  if (!subs) { subs = new Set(); local.set(topic, subs); }
  subs.add(ws);
  ws.topics!.add(topic);
}

function unsubscribe(ws: Sock, topic: string) {
  const subs = local.get(topic);
  if (subs) { subs.delete(ws); if (subs.size === 0) local.delete(topic); }
  ws.topics!.delete(topic);
}

function onMessage(ws: Sock, raw: string) {
  let m: any;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || !m.type) return;
  switch (m.type) {
    case "subscribe":
      (m.topics || []).forEach((t: string) => subscribe(ws, t));
      break;
    case "unsubscribe":
      (m.topics || []).forEach((t: string) => unsubscribe(ws, t));
      break;
    case "publish":
      if (m.topic) {
        const data = JSON.stringify(m);
        deliverLocal(m.topic, data);              // subscribers on this isolate
        relay.postMessage({ topic: m.topic, data }); // subscribers on other isolates
      }
      break;
    case "ping":
      try { ws.send(JSON.stringify({ type: "pong" })); } catch { /* drop */ }
      break;
  }
}

Deno.serve((req) => {
  if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    const ws = socket as Sock;
    ws.topics = new Set();
    ws.onmessage = (e) => onMessage(ws, typeof e.data === "string" ? e.data : "");
    ws.onclose = () => { for (const t of ws.topics!) unsubscribe(ws, t); };
    ws.onerror = () => { try { ws.close(); } catch { /* drop */ } };
    return response;
  }
  return new Response("okay", { headers: { "content-type": "text/plain" } });
});
