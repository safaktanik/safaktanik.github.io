import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './arena/ui/arena.css';
import './theme.css';
import './arena/ui/fx.css';
import './v2/fonts.css';
import './v2/v2.css';
import { installStorageNamespace } from './v2/storage';
import { installPackTheme } from './arena/ui/packTheme';
import { installAudioUnlock } from './audio/sound';

installStorageNamespace();
installPackTheme();
installAudioUnlock();
// Arka plandayken animasyonları durdur (pil / ısınma).
document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('is-hidden', document.hidden));

const root = document.getElementById('root');
if (!root) throw new Error('#root bulunamadı');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
