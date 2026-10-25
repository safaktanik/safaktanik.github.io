/**
 * Davet linki: oyunun açık olduğu sayfanın kendisi (ör. https://safaktanik.github.io/yeni/).
 * Arkadaş odasında kod linke eklenir (#oda=KOD): linke dokunan doğrudan odaya katılır.
 */
export function shareUrl(code: string | null, room = false): string | null {
  const { protocol, origin, pathname } = window.location;
  if (protocol !== 'https:' && protocol !== 'http:') return null;
  return `${origin}${pathname}${room && code ? `#oda=${code}` : ''}`;
}

/** iPhone'da paylaşım menüsünü açar (Mesajlar, WhatsApp…); yoksa panoya kopyalar. */
export async function shareInvite(code: string | null): Promise<'shared' | 'copied' | 'failed'> {
  // Arkadaş odası açıksa (eşler arası), link doğrudan odaya götürür.
  const room = !!document.documentElement.dataset.roomCode && code === document.documentElement.dataset.roomCode;
  const url = shareUrl(code, room);
  const text = code ? `Mine Duel'de seni bekliyorum! Oda kodu: ${code}` : "Mine Duel'de bir el oynayalım mı?";
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  try {
    if (nav.share) {
      await nav.share(url ? { title: 'Mine Duel', text, url } : { title: 'Mine Duel', text });
      return 'shared';
    }
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
