import { useState } from 'react';
import { Sheet, Seg } from './Sheet';
import { Spinner } from './common';
import { playSound } from '../../audio/sound';

/** Sürüm etiketi: geri bildirimlerde hangi sürümün denendiği görünsün. */
export const APP_VERSION = '2.3.1-alpha';
const FORM = 'geri-bildirim';

/**
 * Geri bildirim kanalı sayfadaki <meta name="mineduel-feedback"> etiketinden okunur:
 *  - "formspree:ID"  → Formspree'ye gönderilir (GitHub Pages gibi sabit sitelerde çalışır)
 *  - "netlify"       → Netlify Forms
 *  - "url:https://…" → dış form (ör. Google Form) yeni sekmede açılır
 *  - yok / "none"    → geri bildirim düğmeleri gizlenir
 */
export type FeedbackChannel = { kind: 'formspree'; id: string } | { kind: 'netlify' } | { kind: 'url'; url: string } | { kind: 'none' };
export function feedbackChannel(): FeedbackChannel {
  const v = document.querySelector<HTMLMetaElement>('meta[name="mineduel-feedback"]')?.content?.trim() ?? '';
  if (!/^https?:$/.test(window.location.protocol)) return { kind: 'none' };
  if (v.startsWith('formspree:') && /^[A-Za-z0-9]+$/.test(v.slice(10))) return { kind: 'formspree', id: v.slice(10) };
  if (v === 'netlify') return { kind: 'netlify' };
  if (v.startsWith('url:https://')) return { kind: 'url', url: v.slice(4) };
  return { kind: 'none' };
}
export function feedbackAvailable(): boolean {
  return feedbackChannel().kind !== 'none';
}

function device(): string {
  const n = navigator as Navigator & { userAgentData?: { platform?: string } };
  return `${n.userAgent} | ekran ${window.screen.width}×${window.screen.height} @${window.devicePixelRatio}x | pencere ${window.innerWidth}×${window.innerHeight}`;
}

/** Oyunculardan geri bildirim: puan, tür, mesaj. Mesajlar site sahibinin Netlify panelinde (Forms) toplanır. */
export function FeedbackSheet({ onClose }: { onClose(): void }) {
  const [rating, setRating] = useState(0);
  const [kind, setKind] = useState<'Hata' | 'Öneri' | 'Beğendim' | 'Diğer'>('Öneri');
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const ch = feedbackChannel();
  const can = ch.kind === 'formspree' || ch.kind === 'netlify';
  const send = async () => {
    if (!msg.trim() && !rating) return;
    setState('sending');
    try {
      const ch = feedbackChannel();
      const data = { puan: String(rating || ''), tur: kind, mesaj: msg.trim().slice(0, 3000), isim: name.trim().slice(0, 40), cihaz: device(), surum: APP_VERSION };
      let r: Response;
      if (ch.kind === 'formspree') {
        r = await fetch(`https://formspree.io/f/${ch.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ...data, _subject: `Mine Duel · ${kind}${rating ? ` · ${rating}★` : ''}` }) });
      } else if (ch.kind === 'netlify') {
        const body = new URLSearchParams({ 'form-name': FORM, ...data, 'bot-field': '' });
        r = await fetch(window.location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      } else throw new Error('no-channel');
      if (!r.ok) throw new Error(String(r.status));
      setState('sent');
      playSound('coins');
    } catch {
      setState('error');
    }
  };
  return (
    <Sheet
      title="Görüşünü yaz"
      onClose={onClose}
      footer={
        state === 'sent' ? (
          <button type="button" className="abtn abtn--primary" onClick={onClose}>
            Kapat
          </button>
        ) : (
          <>
            <button type="button" className="abtn abtn--ghost" onClick={onClose}>
              Vazgeç
            </button>
            <button type="button" className="abtn abtn--gold" disabled={!can || state === 'sending' || (!msg.trim() && !rating)} onClick={() => void send()}>
              {state === 'sending' ? <Spinner /> : null} Gönder
            </button>
          </>
        )
      }
    >
      {state === 'sent' ? (
        <div className="fb__done">
          <span aria-hidden="true">💌</span>
          <h3>Teşekkürler!</h3>
          <p className="amuted">Mesajın geliştiriciye ulaştı. Sonraki güncellemelerde dikkate alınacak.</p>
        </div>
      ) : (
        <div className="fb">
          <div className="afgroup">
            <h3>Oyunu nasıl buldun?</h3>
            <div className="fb__stars" role="radiogroup" aria-label="Puan">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} yıldız`} className={n <= rating ? 'is-on' : ''} onClick={() => setRating(n)}>
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="afgroup">
            <h3>Konu</h3>
            <Seg label="Konu" value={kind} onChange={(v) => setKind(v)} options={[{ v: 'Hata', label: '🐞 Hata' }, { v: 'Öneri', label: '💡 Öneri' }, { v: 'Beğendim', label: '❤️ Beğendim' }, { v: 'Diğer', label: 'Diğer' }]} />
          </div>
          <label className="afield">
            <span>Mesajın</span>
            <textarea rows={5} maxLength={3000} value={msg} placeholder={kind === 'Hata' ? 'Ne oldu? Hangi ekranda, ne yaparken? (mod, masa, kaç kişi…)' : 'Aklındakini yaz…'} onChange={(e) => setMsg(e.target.value)} />
          </label>
          <label className="afield">
            <span>Adın (isteğe bağlı)</span>
            <input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Takma ad da olur" />
          </label>
          <p className="asmall amuted">Hataları çözebilmek için mesajla birlikte tarayıcı ve ekran bilgisi (ör. “iPhone, Safari, 390×844”) gönderilir. Başka kişisel bilgi toplanmaz.</p>
          {ch.kind === 'url' ? (
            <a className="abtn abtn--primary" href={ch.url} target="_blank" rel="noopener">
              Geri bildirim formunu aç ↗
            </a>
          ) : !can ? (
            <p className="aerror">Geri bildirim yalnızca oyunun yayındaki sitesinde gönderilebilir.</p>
          ) : null}
          {state === 'error' ? <p className="aerror">Gönderilemedi. İnternet bağlantını kontrol edip tekrar dene.</p> : null}
        </div>
      )}
    </Sheet>
  );
}
