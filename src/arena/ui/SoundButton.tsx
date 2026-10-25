import { useState } from 'react';
import { isSoundEnabled, setSoundEnabled } from '../../audio/sound';
import { PackIcon } from './PackIcon';

export function SoundButton() {
  const [on, setOn] = useState(isSoundEnabled());
  return (
    <button
      type="button"
      className="aicon"
      aria-label={on ? 'Sesi kapat' : 'Sesi aç'}
      title={on ? 'Sesi kapat' : 'Sesi aç'}
      onClick={() => {
        setSoundEnabled(!on);
        setOn(!on);
      }}
    >
      <PackIcon name={on ? 'icon_sound_on' : 'icon_sound_off'} size={26} />
    </button>
  );
}
