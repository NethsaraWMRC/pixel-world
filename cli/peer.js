// Node peer: joins the same WebRTC mesh as the browser via y-webrtc.
// Node lacks WebRTC, so we supply it with node-datachannel's polyfill (the guide's pick).
// Signaling URL is passed in (see pixelmesh.js) — public y-webrtc servers are dead,
// so you run your own tiny signaling server and expose it (tunnel or host).
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import * as wrtc from "node-datachannel/polyfill";

export const ROOM = process.env.PIXELMESH_ROOM || "pixelmesh-world";

export function joinWorld(peerId, { signaling } = {}) {
  const doc = new Y.Doc();
  const plots = doc.getMap("plots");           // plotId -> plot (Y.Map)

  const provider = new WebrtcProvider(ROOM, doc, {
    signaling: Array.isArray(signaling) ? signaling : [signaling],
    peerOpts: { wrtc },                         // <-- Node WebRTC implementation
    maxConns: 40,
  });

  provider.awareness.setLocalStateField("peer", { id: peerId, t: Date.now() });

  return { Y, doc, plots, provider, awareness: provider.awareness };
}
