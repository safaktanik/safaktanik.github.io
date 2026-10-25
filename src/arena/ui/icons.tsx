import type { SVGProps } from 'react';
import { KIT } from '../../v2/kit';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

export const UserIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>);
export const GearIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" /></svg>);
export const BagIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M5 8h14l-1.2 12H6.2Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>);
export const TrophyIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M8 4h8v5a4 4 0 0 1-8 0Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></svg>);
export const FilterIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z" /></svg>);
export const PlusIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M12 5v14M5 12h14" /></svg>);
export const BoltIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z" fill="currentColor" stroke="none" /></svg>);
/** Geri: arayüz setinin nane yeşili oku. */
export const BackIcon = ({ size = 20 }: P) => (<img className="kit kit-back" src={KIT.arrowLeft} width={Math.round(size * 0.85)} height={size} alt="" aria-hidden="true" draggable={false} />);
export const LockIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>);
export const GridIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" /></svg>);
export const MineIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="12" cy="12" r="5.2" fill="currentColor" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2" /></svg>);
export const SeatsIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c1-3.5 3.5-5 6-5s5 1.5 6 5" /><path d="M16 4.6a3.2 3.2 0 0 1 0 6.3M18 15.4c1.6.7 2.6 2.2 3 4.6" /></svg>);
export const ExitIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>);
export const ZoomInIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.3-4.3M8 11h6M11 8v6" /></svg>);
export const ZoomOutIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.3-4.3M8 11h6" /></svg>);
export const GiftIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><rect x="3.5" y="9" width="17" height="11.5" rx="2" /><path d="M2.5 9h19v-3h-19ZM12 6v14.5M12 6c-1.5-3.5-6-3.5-6-1 0 1.5 2.5 1 6 1Zm0 0c1.5-3.5 6-3.5 6-1 0 1.5-2.5 1-6 1Z" /></svg>);
export const LifebuoyIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="M6 6l3.5 3.5M14.5 14.5 18 18M18 6l-3.5 3.5M9.5 14.5 6 18" /></svg>);
export const CrownIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M3.5 18h17l1-11-5.5 4.5L12 4l-4 7.5L2.5 7Z" fill="currentColor" /></svg>);
export const ClockIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>);
export const FlagIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>);
export const ChestIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M3.5 10h17v9.5h-17Z" /><path d="M3.5 10a8.5 5 0 0 1 17 0" /><path d="M10 12.5h4v3h-4Z" /></svg>);
export const ChainIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4L11.4 6.2" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0L5 12.6a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></svg>);
export const SkullIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><path d="M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.4 1.1 4 2.8 5v3h9.4v-3c1.7-1 2.8-2.6 2.8-5 0-4-3.1-7-7.5-7Z" /><circle cx="9" cy="11" r="1.6" fill="currentColor" /><circle cx="15" cy="11" r="1.6" fill="currentColor" /><path d="M10.5 18.5v-2M13.5 18.5v-2" /></svg>);
export const CrosshairIcon = ({ size, ...r }: P) => (<svg {...base(size)} {...r}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>);
