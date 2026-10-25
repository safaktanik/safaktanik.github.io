/**
 * Çok küçük bir MQTT 3.1.1 istemcisi (WebSocket üzerinden, yalnızca QoS 0).
 * Arkadaş odasında telefonlar doğrudan bağlanamadığında (mobil ağ, NAT) mesajlar herkese açık
 * ücretsiz MQTT aracılarından geçer: yalnızca standart HTTPS/WSS kullandığı için her ağda çalışır.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function str(s: string): Uint8Array {
  const b = enc.encode(s);
  const out = new Uint8Array(b.length + 2);
  out[0] = b.length >> 8;
  out[1] = b.length & 0xff;
  out.set(b, 2);
  return out;
}
function varLen(n: number): number[] {
  const out: number[] = [];
  do {
    let d = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) d |= 0x80;
    out.push(d);
  } while (n > 0);
  return out;
}
function packet(first: number, ...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const head = [first, ...varLen(len)];
  const out = new Uint8Array(head.length + len);
  out.set(head, 0);
  let o = head.length;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface MqttClient {
  readonly url: string;
  subscribe(topic: string): void;
  publish(topic: string, payload: string): void;
  onMessage(fn: (topic: string, payload: string) => void): void;
  onClose(fn: () => void): void;
  isOpen(): boolean;
  close(): void;
}

/** Aracıya bağlanır; CONNACK gelince çözülür. */
/** will: bağlantı beklenmedik koparsa aracının yayınlayacağı "vasiyet" mesajı (MQTT Last Will). */
export function mqttConnect(url: string, timeoutMs = 7000, will?: { topic: string; payload: string }): Promise<MqttClient> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ['mqtt']);
    } catch (e) {
      reject(e);
      return;
    }
    ws.binaryType = 'arraybuffer';
    const msgFns = new Set<(t: string, p: string) => void>();
    const closeFns = new Set<() => void>();
    let open = false;
    let closed = false;
    let buf = new Uint8Array(0);
    let pid = 1;
    let ping: number | null = null;
    const timer = window.setTimeout(() => {
      if (!open) {
        try {
          ws.close();
        } catch {
          /* yok say */
        }
        reject(new Error('mqtt-timeout'));
      }
    }, timeoutMs);
    const send = (b: Uint8Array) => {
      if (ws.readyState === 1) ws.send(b as Uint8Array<ArrayBuffer>);
    };
    const finish = () => {
      if (closed) return;
      closed = true;
      open = false;
      if (ping) window.clearInterval(ping);
      for (const f of closeFns) f();
    };
    const client: MqttClient = {
      url,
      subscribe(topic) {
        const id = pid++ & 0xffff || 1;
        send(packet(0x82, new Uint8Array([id >> 8, id & 0xff]), str(topic), new Uint8Array([0])));
      },
      publish(topic, payload) {
        send(packet(0x30, str(topic), enc.encode(payload)));
      },
      onMessage: (fn) => msgFns.add(fn),
      onClose: (fn) => closeFns.add(fn),
      isOpen: () => open && ws.readyState === 1,
      close() {
        if (ws.readyState === 1) send(new Uint8Array([0xe0, 0]));
        try {
          ws.close();
        } catch {
          /* yok say */
        }
        finish();
      },
    };
    const handle = (type: number, body: Uint8Array) => {
      if (type === 2) {
        // CONNACK
        window.clearTimeout(timer);
        if (body[1] !== 0) {
          reject(new Error(`mqtt-refused-${body[1]}`));
          client.close();
          return;
        }
        open = true;
        ping = window.setInterval(() => send(new Uint8Array([0xc0, 0])), 20000);
        resolve(client);
      } else if (type === 3) {
        // PUBLISH (QoS 0 bekleniyor; QoS>0 gelirse paket kimliğini atla)
        const tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.subarray(2, 2 + tl));
        let o = 2 + tl;
        const qos = (body as Uint8Array & { qos?: number }).qos ?? 0;
        if (qos > 0) o += 2;
        const payload = dec.decode(body.subarray(o));
        for (const f of msgFns) f(topic, payload);
      }
    };
    ws.onopen = () => {
      const cid = `md${Math.random().toString(36).slice(2, 12)}`;
      // protokol adı "MQTT", seviye 4, temiz oturum, 30 sn canlı tutma
      const vh = new Uint8Array([0, 4, 0x4d, 0x51, 0x54, 0x54, 4, will ? 0x06 : 0x02, 0, 30]);
      if (will) send(packet(0x10, vh, str(cid), str(will.topic), str(will.payload)));
      else send(packet(0x10, vh, str(cid)));
    };
    ws.onmessage = (ev) => {
      const chunk = new Uint8Array(ev.data as ArrayBuffer);
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf, 0);
      merged.set(chunk, buf.length);
      buf = merged;
      // tampondaki tam paketleri işle
      for (;;) {
        if (buf.length < 2) break;
        let mul = 1;
        let len = 0;
        let i = 1;
        let ok = false;
        while (i < buf.length && i <= 4) {
          const d = buf[i];
          len += (d & 0x7f) * mul;
          mul *= 128;
          i++;
          if (!(d & 0x80)) {
            ok = true;
            break;
          }
        }
        if (!ok || buf.length < i + len) break;
        const first = buf[0];
        const body = buf.slice(i, i + len) as Uint8Array & { qos?: number };
        body.qos = (first >> 1) & 3;
        buf = buf.slice(i + len);
        handle(first >> 4, body);
      }
    };
    ws.onerror = () => {
      if (!open) {
        window.clearTimeout(timer);
        reject(new Error('mqtt-error'));
      }
    };
    ws.onclose = () => {
      if (!open) {
        window.clearTimeout(timer);
        reject(new Error('mqtt-closed'));
      }
      finish();
    };
  });
}
