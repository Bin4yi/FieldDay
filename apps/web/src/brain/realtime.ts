import { serverUrl } from '../net/online.js';

// Boost Mode live referee voice: OpenAI Realtime over WebRTC. The server
// mints a short-lived client secret; the API key never reaches the phone.
// We send the referee's line as text; the model says it out loud in style.

export class RealtimeReferee {
  private lostCb: (() => void) | null = null;
  private closed = false;

  private constructor(
    private pc: RTCPeerConnection,
    private dc: RTCDataChannel,
    private audio: HTMLAudioElement,
  ) {
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) this.lost();
    };
    dc.onclose = () => this.lost();
  }

  static async connect(style: string, kids: boolean): Promise<RealtimeReferee> {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('No WebRTC in this browser');
    const tokenRes = await fetch(`${serverUrl()}/openai/realtime-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ style, kids }),
    });
    if (!tokenRes.ok) throw new Error(`Boost voice not available (${tokenRes.status})`);
    const token = (await tokenRes.json()) as { value: string };

    const pc = new RTCPeerConnection();
    const audio = new Audio();
    audio.autoplay = true;
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] ?? null;
    };
    pc.addTransceiver('audio', { direction: 'recvonly' });
    const dc = pc.createDataChannel('oai-events');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      body: offer.sdp ?? '',
      headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/sdp' },
    });
    if (!sdp.ok) {
      pc.close();
      throw new Error(`Realtime connect failed (${sdp.status})`);
    }
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Realtime timed out')), 8000);
      dc.onopen = () => (clearTimeout(t), resolve());
    });
    return new RealtimeReferee(pc, dc, audio);
  }

  get open(): boolean {
    return !this.closed && this.dc.readyState === 'open';
  }

  /** Say a referee moment out loud (the model rewords it in style). */
  say(line: string) {
    if (!this.open) return false;
    this.dc.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `Referee moment: ${line}` }] },
      }),
    );
    this.dc.send(JSON.stringify({ type: 'response.create' }));
    return true;
  }

  onLost(cb: () => void) {
    this.lostCb = cb;
  }

  private lost() {
    if (this.closed) return;
    this.closed = true;
    this.lostCb?.();
  }

  close() {
    this.closed = true;
    try {
      this.dc.close();
      this.pc.close();
      this.audio.srcObject = null;
    } catch {
      // ignore
    }
  }
}
