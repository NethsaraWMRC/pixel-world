// Node peer: joins the same WebRTC mesh as the browser via y-webrtc.
// Node lacks WebRTC, so we supply it with node-datachannel's polyfill (the guide's pick).
// Signaling URL is passed in (see pixelmesh.js) — public y-webrtc servers are dead,
// so you run your own tiny signaling server and expose it (tunnel or host).
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import * as wrtc from "node-datachannel/polyfill";

// y-webrtc needs a global `WebSocket` to reach the signaling server. Node only ships one
// built in from v22.4+ — on older Node (v20/v21, or v22 without the flag) it's undefined
// and everything fails with "WebSocket is not defined". Polyfill it unconditionally so
// `pixelworld` works the same on any Node 20+, no flags, no version guesswork.
if (typeof globalThis.WebSocket === "undefined") {
  const { WebSocket } = await import("ws");
  globalThis.WebSocket = WebSocket;
}

export const ROOM = process.env.PIXELMESH_ROOM || "pixelmesh-world";

// STUN + free TURN so peers behind home routers (NAT) can still connect across networks.
// TURN relays traffic when direct P2P is blocked (~20-30% of connections need it).
// Node uses UDP TURN only — node-datachannel stalls on TCP/TLS TURN URLs.
// (Browsers use the full list incl. TCP/TLS; both sides meet at the same relay.)
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "turn:global.relay.metered.ca:80", username: "c8fceaed1cd84f3dc63d10a3", credential: "m1rJWeuhD0Lrv4iZ" },
  { urls: "turn:global.relay.metered.ca:443", username: "c8fceaed1cd84f3dc63d10a3", credential: "m1rJWeuhD0Lrv4iZ" },
];

export function joinWorld(peerId, { signaling } = {}) {
  const doc = new Y.Doc();
  const plots = doc.getMap("plots");           // plotId -> plot (Y.Map)

  const provider = new WebrtcProvider(ROOM, doc, {
    signaling: Array.isArray(signaling) ? signaling : [signaling],
    peerOpts: { wrtc, config: { iceServers: ICE_SERVERS } }, // Node WebRTC + NAT traversal
    maxConns: 40,
  });

  provider.awareness.setLocalStateField("peer", { id: peerId, t: Date.now() });

  return { Y, doc, plots, provider, awareness: provider.awareness };
}
