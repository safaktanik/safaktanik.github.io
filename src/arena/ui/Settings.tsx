import { useState } from 'react';
import { arenaClient } from '../client';
import { isMusicEnabled, isSoundEnabled, setMusicEnabled, setSoundEnabled } from '../../audio/sound';
import { applyMotion, loadMotion, useArena } from './common';
import { BackIcon, ExitIcon } from './icons';
import { APP_VERSION, FeedbackSheet, feedbackAvailable } from './Feedback';
import { HowTo } from './Intro';

export function Settings({ onBack, onExit }: { onBack(): void; onExit(): void }) {
  const s = useArena();
  const [sound, setSound] = useState(isSoundEnabled());
  const [music, setMusic] = useState(isMusicEnabled());
  const [motion, setMotion] = useState(loadMotion());
  const [fb, setFb] = useState(false);
  const [howto, setHowto] = useState(false);
  return (
    <div className="ar-root ascreen settings">
      <header className="ahead">
        <button type="button" className="aback" onClick={onBack}>
          <BackIcon size={18} /> Lobi
        </button>
        <h1>Ayarlar</h1>
      </header>
      <section className="apanel">
        <label className="aswitch">
          <span>Ses efektleri</span>
          <input type="checkbox" checked={sound} onChange={(e) => (setSound(e.target.checked), setSoundEnabled(e.target.checked))} />
        </label>
        <label className="aswitch">
          <span>Maç müziği</span>
          <input type="checkbox" checked={music} disabled={!sound} onChange={(e) => (setMusic(e.target.checked), setMusicEnabled(e.target.checked))} />
        </label>
        <p className="asmall amuted">Sıra sende ve sürenin son 5 saniyesinde sesli uyarı çalar (telefon sessizdeyse iPhone web seslerini kapatır).</p>
        <label className="aswitch">
          <span>Animasyonlar</span>
          <input type="checkbox" checked={motion} onChange={(e) => (setMotion(e.target.checked), applyMotion(e.target.checked))} />
        </label>
      </section>
      <section className="apanel">
        <p className="asmall amuted">Bağlantı: {s.conn === 'online' ? 'çevrimiçi' : s.conn === 'offline' ? 'koptu, yeniden deneniyor' : 'bağlanıyor'}</p>
        {feedbackAvailable() ? (
          <button type="button" className="abtn abtn--primary" onClick={() => setFb(true)}>
            💌 Görüşünü yaz / hata bildir
          </button>
        ) : null}
        <button type="button" className="abtn abtn--ghost" onClick={() => setHowto(true)}>
          Nasıl oynanır?
        </button>
        <button type="button" className="abtn abtn--ghost" onClick={onExit}>
          Açılış ekranına dön
        </button>
        <p className="asmall amuted">Sürüm {APP_VERSION}</p>
        {arenaClient().kind === 'server' ? (
        <button
          type="button"
          className="abtn abtn--danger"
          onClick={() => {
            if (s.me?.accountType === 'guest' && !window.confirm('Misafir hesaptan çıkarsan bu ilerlemeye bir daha ulaşamazsın (önce Profil’den kalıcı hesaba dönüştürebilirsin). Çıkılsın mı?')) return;
            void arenaClient().logout();
          }}
        >
          <ExitIcon size={18} /> Çıkış yap
        </button>
        ) : null}
      </section>
      {fb ? <FeedbackSheet onClose={() => setFb(false)} /> : null}
      {howto ? <HowTo onClose={() => setHowto(false)} /> : null}
    </div>
  );
}
