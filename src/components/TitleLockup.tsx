import React from 'react';

export const TitleLockupSvg: React.FC = () => {
  return (
    <svg
      viewBox="0 0 680 176"
      className="w-full max-w-[560px] h-auto select-none overflow-visible"
      role="img"
      aria-label="Kindred Lanterns"
    >
      <defs>
        <linearGradient id="kl-gold-rose" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="48%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#FECDD3" />
        </linearGradient>
        <linearGradient id="kl-tether-line" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0" />
          <stop offset="20%" stopColor="#F59E0B" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#FFFBEB" stopOpacity="1" />
          <stop offset="80%" stopColor="#FB7185" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FB7185" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Top intertwined Sun & Crescent emblem connected by a silk curve */}
      <path
        d="M 185 34 C 260 56, 420 12, 495 34"
        fill="none"
        stroke="url(#kl-tether-line)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Left Sol Emblem */}
      <g transform="translate(212, 34)">
        <circle r="9" fill="#F59E0B" fillOpacity="0.22" />
        <circle r="4.5" fill="#FDE68A" />
        <path
          d="M 0 -10 L 0 -14 M 0 10 L 0 14 M -10 0 L -14 0 M 10 0 L 14 0"
          stroke="#FDE68A"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>

      {/* Center Heart-Lantern Knot */}
      <g transform="translate(340, 34)">
        <path
          d="M 0 -12 L 9 0 L 0 12 L -9 0 Z"
          fill="#0F1B2D"
          stroke="#FDE68A"
          strokeWidth="1.6"
        />
        <circle r="3" fill="#FFFBEB" />
      </g>

      {/* Right Luna Crescent Emblem */}
      <g transform="translate(468, 34)">
        <circle r="9" fill="#FB7185" fillOpacity="0.2" />
        <path
          d="M 2 -6.5 A 6.5 6.5 0 1 0 2 6.5 A 5 5 0 1 1 2 -6.5 Z"
          fill="#FECDD3"
        />
      </g>

      {/* Sculpted Display Title */}
      <text
        x="340"
        y="102"
        textAnchor="middle"
        fill="url(#kl-gold-rose)"
        className="font-display font-semibold tracking-wide"
        fontSize="56"
      >
        Kindred Lanterns
      </text>

      {/* Delicate bottom filigree rule */}
      <path
        d="M 150 126 Q 340 142 530 126"
        fill="none"
        stroke="url(#kl-tether-line)"
        strokeWidth="1.5"
      />

      <text
        x="340"
        y="156"
        textAnchor="middle"
        fill="#CBD5E1"
        className="font-sans font-medium tracking-wider"
        fontSize="14.5"
      >
        Two spirits · One luminous silk bond · Five twilight sanctuaries
      </text>
    </svg>
  );
};

export const BondHeartSvg: React.FC<{ filled: boolean; strained?: boolean }> = ({ filled, strained }) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
    <path
      d="M12 20.4C12 20.4 4 14.9 4 9.2C4 6.4 6.2 4.3 8.9 4.3C10.5 4.3 11.9 5.1 12 6.3C12.1 5.1 13.5 4.3 15.1 4.3C17.8 4.3 20 6.4 20 9.2C20 14.9 12 20.4 12 20.4Z"
      fill={filled ? (strained ? '#EF4444' : '#FB7185') : '#162235'}
      stroke={filled ? (strained ? '#FCA5A5' : '#FDE68A') : '#475569'}
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    {filled && (
      <circle cx="12" cy="10.8" r="2.1" fill="#FFFBEB" fillOpacity="0.85" />
    )}
  </svg>
);

export const LanternHudSvg: React.FC<{ allLit: boolean }> = ({ allLit }) => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
    <path
      d="M9 4H15M10 4L8 8.5V15.5L10 19H14L16 15.5V8.5L14 4M9.5 21H14.5"
      fill={allLit ? '#34D399' : '#F59E0B'}
      fillOpacity={allLit ? '0.35' : '0.25'}
      stroke={allLit ? '#6EE7B7' : '#FDE68A'}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="2.2" fill={allLit ? '#A7F3D0' : '#FEF3C7'} />
  </svg>
);

export const SoundIconSvg: React.FC<{ muted: boolean }> = ({ muted }) => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
    <path
      d="M11 5L6 9H3V15H6L11 19V5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    {muted ? (
      <path
        d="M21 9L15 15M15 9L21 15"
        stroke="#FB7185"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    ) : (
      <path
        d="M15.5 8.5C16.8 9.8 16.8 14.2 15.5 15.5M18.5 6C21 8.8 21 15.2 18.5 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    )}
  </svg>
);

export const PauseIconSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </svg>
);
