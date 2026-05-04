// PeerJS helpers — uses the free public PeerJS broker by default.
// For best audio quality on poor networks, self-host PeerJS + a TURN server
// (see public/server.txt). To switch, set VITE_PEER_HOST / VITE_PEER_PORT /
// VITE_PEER_PATH and optionally VITE_TURN_URL / VITE_TURN_USER / VITE_TURN_CRED
// in your build environment.

import Peer, { type MediaConnection, type PeerOptions } from "peerjs";

export const ROOM_PREFIX = "zentord-";

export const userPeerId = (room: string) => `${ROOM_PREFIX}${room}-user`;
export const agentPeerId = (room: string, slot = 0) =>
  `${ROOM_PREFIX}${room}-agent-${slot}`;

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUser = import.meta.env.VITE_TURN_USER as string | undefined;
  const turnCred = import.meta.env.VITE_TURN_CRED as string | undefined;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: turnUser || undefined,
      credential: turnCred || undefined,
    });
  }
  return servers;
}

export function createPeer(id: string): Peer {
  const opts: PeerOptions = {
    debug: 1,
    config: {
      iceServers: buildIceServers(),
      iceCandidatePoolSize: 4,
    },
  };
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;
  if (host) {
    opts.host = host;
    opts.port = Number(import.meta.env.VITE_PEER_PORT || 443);
    opts.path = (import.meta.env.VITE_PEER_PATH as string) || "/peerjs";
    opts.secure = String(import.meta.env.VITE_PEER_SECURE ?? "true") !== "false";
  }
  return new Peer(id, opts);
}

// Best-effort high-quality mic: AEC/NS/AGC + 48 kHz stereo when supported.
export async function getHighQualityMicStream(): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 },
    },
    video: false,
  };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

// Force Opus stereo + high bitrate by patching the SDP.
export function preferOpusHQ(sdp: string): string {
  try {
    // Find the m=audio line and pick the Opus payload type
    const lines = sdp.split(/\r?\n/);
    const mLineIdx = lines.findIndex((l) => l.startsWith("m=audio"));
    if (mLineIdx < 0) return sdp;
    const opusRtp = lines.find((l) => /^a=rtpmap:\d+ opus\/48000/.test(l));
    if (!opusRtp) return sdp;
    const opusPt = opusRtp.match(/^a=rtpmap:(\d+)/)?.[1];
    if (!opusPt) return sdp;

    // Reorder m=audio to put opus first
    const mParts = lines[mLineIdx].split(" ");
    const head = mParts.slice(0, 3);
    const pts = mParts.slice(3).filter((p) => p !== opusPt);
    lines[mLineIdx] = [...head, opusPt, ...pts].join(" ");

    // Add / replace fmtp for opus
    const fmtpIdx = lines.findIndex((l) => l.startsWith(`a=fmtp:${opusPt}`));
    const fmtp = `a=fmtp:${opusPt} minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000;cbr=0`;
    if (fmtpIdx >= 0) lines[fmtpIdx] = fmtp;
    else lines.splice(mLineIdx + 1, 0, fmtp);

    return lines.join("\r\n");
  } catch {
    return sdp;
  }
}

// Apply HQ encoding params to outgoing audio sender on a peer connection.
export async function tuneOutgoingAudio(pc: RTCPeerConnection) {
  try {
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === "audio");
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 128_000; // 128 kbps Opus stereo
    params.encodings[0].priority = "high";
    params.encodings[0].networkPriority = "high";
    await sender.setParameters(params);
  } catch {
    /* not supported in some browsers — safe to ignore */
  }
}

export function generateRoomId() {
  return (
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 6)
  );
}

export type CallHandle = {
  call: MediaConnection;
  close: () => void;
};
