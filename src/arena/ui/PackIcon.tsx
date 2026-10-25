import { PACK } from './packArt';
import type { PackKey } from './packArt';

/** Varlık paketinden renkli simge. */
export function PackIcon({ name, size = 22, className = '', alt = '' }: { name: PackKey; size?: number; className?: string; alt?: string }) {
  return <img className={`packicon ${className}`} src={PACK[name]} width={size} height={size} alt={alt} draggable={false} />;
}
