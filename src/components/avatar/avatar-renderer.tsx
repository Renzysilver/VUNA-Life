/**
 * AvatarRenderer — layered SVG avatar (Phase 7)
 *
 * 9 layers, bottom to top:
 * 1. body_shape (slim/medium/full)
 * 2. skin_tone (6 tones)
 * 3. outfit_top (shirt/hoodie/polo/native)
 * 4. outfit_bottom (trousers/shorts/skirt)
 * 5. shoes (sneakers/loafers/slides/boots)
 * 6. accessory_1 (chain/necklace)
 * 7. accessory_2 (watch/bracelet)
 * 8. accessory_3 (glasses)
 * 9. hair (maps to hair stage)
 *
 * Viewport: 200×320px. Self-contained inline SVG — no external images.
 * Works on Vercel without asset pipeline complexity.
 *
 * HARD RULE: No real brand logos in any SVG. All shapes are original
 * geometric forms.
 */

'use client';

export type BodyType = 'slim' | 'medium' | 'full';
export type SkinTone = '#FDDBB4' | '#EAC086' | '#D4956A' | '#9C6035' | '#6B3E20' | '#3D1C0A';
export type HairStage = 'Fresh' | 'Neat' | 'Growing' | 'Overdue' | 'Violation';

export type EquippedItems = {
  outfit_top?: string;       // wardrobe item ID
  outfit_bottom?: string;
  shoes?: string;
  accessory_1?: string;
  accessory_2?: string;
  accessory_3?: string;
};

export type AvatarConfig = {
  bodyType: BodyType;
  skinTone: SkinTone;
};

type Props = {
  config: AvatarConfig | null;
  equipped: EquippedItems | null;
  hairStage: HairStage | null;
  size?: 'tiny' | 'small' | 'large';
};

const SKIN_TONES: SkinTone[] = ['#FDDBB4', '#EAC086', '#D4956A', '#9C6035', '#6B3E20', '#3D1C0A'];

const SIZES = {
  tiny: { w: 40, h: 64 },
  small: { w: 80, h: 128 },
  large: { w: 200, h: 320 },
};

export function AvatarRenderer({ config, equipped, hairStage, size = 'large' }: Props) {
  const bodyType = config?.bodyType ?? 'medium';
  const skinTone = config?.skinTone ?? '#EAC086';
  const dims = SIZES[size];
  const scale = dims.w / 200;

  // Body widths per type
  const bodyW = bodyType === 'slim' ? 50 : bodyType === 'medium' ? 60 : 70;

  return (
    <svg
      width={dims.w}
      height={dims.h}
      viewBox="0 0 200 320"
      style={{ display: 'block' }}
    >
      {/* ── Layer 1+2: Body shape + skin tone ─────────────────── */}
      {/* Head */}
      <circle cx="100" cy="50" r="32" fill={skinTone} stroke="#00000020" strokeWidth="1" />
      {/* Neck */}
      <rect x="92" y="78" width="16" height="14" fill={skinTone} />
      {/* Torso */}
      <rect
        x={100 - bodyW / 2}
        y="92"
        width={bodyW}
        height="90"
        rx="8"
        fill={skinTone}
        stroke="#00000015"
        strokeWidth="1"
      />
      {/* Arms */}
      <rect x={100 - bodyW / 2 - 12} y="95" width="12" height="75" rx="6" fill={skinTone} />
      <rect x={100 + bodyW / 2} y="95" width="12" height="75" rx="6" fill={skinTone} />
      {/* Legs */}
      <rect x={100 - bodyW / 2 + 4} y="182" width={bodyW / 2 - 6} height="90" rx="6" fill={skinTone} />
      <rect x={100 + 2} y="182" width={bodyW / 2 - 6} height="90" rx="6" fill={skinTone} />

      {/* ── Layer 3: Outfit top (shirt/hoodie/polo) ──────────── */}
      {equipped?.outfit_top ? (
        <OutfitTop variant={equipped.outfit_top} bodyW={bodyW} />
      ) : (
        // Default: plain white tee
        <rect x={100 - bodyW / 2} y="92" width={bodyW} height="80" rx="6" fill="#f0f0f0" stroke="#ccc" strokeWidth="1" />
      )}

      {/* ── Layer 4: Outfit bottom (trousers/shorts) ────────── */}
      {equipped?.outfit_bottom ? (
        <OutfitBottom variant={equipped.outfit_bottom} bodyW={bodyW} />
      ) : (
        // Default: dark trousers
        <>
          <rect x={100 - bodyW / 2 + 4} y="182" width={bodyW / 2 - 6} height="85" rx="4" fill="#2a2a3a" />
          <rect x={100 + 2} y="182" width={bodyW / 2 - 6} height="85" rx="4" fill="#2a2a3a" />
        </>
      )}

      {/* ── Layer 5: Shoes ───────────────────────────────────── */}
      {equipped?.shoes ? (
        <Shoes variant={equipped.shoes} />
      ) : (
        // Default: simple dark shoes
        <>
          <ellipse cx={100 - bodyW / 4} cy="278" rx="14" ry="8" fill="#1a1a2a" />
          <ellipse cx={100 + bodyW / 4} cy="278" rx="14" ry="8" fill="#1a1a2a" />
        </>
      )}

      {/* ── Layer 6: Accessory 1 (chain/necklace) ───────────── */}
      {equipped?.accessory_1 && (
        <Accessory1 variant={equipped.accessory_1} />
      )}

      {/* ── Layer 7: Accessory 2 (watch/bracelet) ────────────── */}
      {equipped?.accessory_2 && (
        <Accessory2 variant={equipped.accessory_2} />
      )}

      {/* ── Layer 8: Accessory 3 (glasses) ───────────────────── */}
      {equipped?.accessory_3 && (
        <Accessory3 variant={equipped.accessory_3} />
      )}

      {/* ── Layer 9: Hair (maps to hair stage) ──────────────── */}
      <Hair stage={hairStage ?? 'Fresh'} skinTone={skinTone} />
    </svg>
  );
}

// ── Layer components ─────────────────────────────────────────────────────

function OutfitTop({ variant, bodyW }: { variant: string; bodyW: number }) {
  // Map wardrobe item variant to a simple SVG shape + color.
  // In production, this would fetch the item's visual data from the DB.
  // For now, we use the variant string as a lookup key.
  const styles: Record<string, { color: string; pattern?: string }> = {
    white_button_down: { color: '#f8f8f8' },
    navy_polo: { color: '#1a237e' },
    lagos_streetwear_hoodie: { color: '#2e7d32' },
    ankara_print_shirt: { color: '#e65100' },
    gucci_inspired_polo: { color: '#1a237e' },
    default: { color: '#f0f0f0' },
  };
  const style = styles[variant] ?? styles.default;
  return (
    <g>
      <rect x={100 - bodyW / 2} y="92" width={bodyW} height="80" rx="6" fill={style.color} stroke="#00000020" strokeWidth="1" />
      {/* Collar V-neck */}
      <path d={`M ${100 - 8} 92 L 100 110 L ${100 + 8} 92 Z`} fill="none" stroke="#00000030" strokeWidth="2" />
    </g>
  );
}

function OutfitBottom({ variant, bodyW }: { variant: string; bodyW: number }) {
  const styles: Record<string, { color: string }> = {
    black_chinos: { color: '#1a1a2a' },
    cargo_pants: { color: '#3d3d2a' },
    ankara_trousers: { color: '#e65100' },
    balenciaga_inspired_joggers: { color: '#0d0d1a' },
    default: { color: '#2a2a3a' },
  };
  const style = styles[variant] ?? styles.default;
  return (
    <g>
      <rect x={100 - bodyW / 2 + 4} y="182" width={bodyW / 2 - 6} height="85" rx="4" fill={style.color} />
      <rect x={100 + 2} y="182" width={bodyW / 2 - 6} height="85" rx="4" fill={style.color} />
    </g>
  );
}

function Shoes({ variant }: { variant: string }) {
  const styles: Record<string, { color: string }> = {
    white_sneakers: { color: '#f8f8f8' },
    brown_loafers: { color: '#6d4c41' },
    slides: { color: '#424242' },
    yeezy_inspired_sneakers: { color: '#1a1a1a' },
    default: { color: '#1a1a2a' },
  };
  const style = styles[variant] ?? styles.default;
  return (
    <g>
      <ellipse cx={75} cy="278" rx="14" ry="8" fill={style.color} stroke="#00000020" strokeWidth="1" />
      <ellipse cx={125} cy="278" rx="14" ry="8" fill={style.color} stroke="#00000020" strokeWidth="1" />
    </g>
  );
}

function Accessory1({ variant }: { variant: string }) {
  // Chain/necklace — a simple curved line around the neck.
  const styles: Record<string, { color: string; stroke: number }> = {
    gold_chain: { color: '#FFD700', stroke: 3 },
    silver_chain: { color: '#C0C0C0', stroke: 3 },
    rosary: { color: '#8B4513', stroke: 2 },
    default: { color: '#FFD700', stroke: 3 },
  };
  const style = styles[variant] ?? styles.default;
  return (
    <path
      d="M 80 92 Q 100 105 120 92"
      fill="none"
      stroke={style.color}
      strokeWidth={style.stroke}
      strokeLinecap="round"
    />
  );
}

function Accessory2({ variant }: { variant: string }) {
  // Watch/bracelet — small circle on the left wrist.
  const styles: Record<string, { color: string }> = {
    casio_style: { color: '#424242' },
    ap_inspired: { color: '#FFD700' },
    default: { color: '#424242' },
  };
  const style = styles[variant] ?? styles.default;
  return (
    <circle cx={100 - 38} cy="168" r="6" fill={style.color} stroke="#00000030" strokeWidth="1" />
  );
}

function Accessory3({ variant }: { variant: string }) {
  // Glasses — two circles + bridge.
  const styles: Record<string, { color: string; lens: string }> = {
    round_frames: { color: '#424242', lens: 'none' },
    shades: { color: '#1a1a2a', lens: '#00000060' },
    default: { color: '#424242', lens: 'none' },
  };
  const style = styles[variant] ?? styles.default;
  return (
    <g>
      <circle cx="86" cy="50" r="10" fill={style.lens === 'none' ? 'none' : style.lens} stroke={style.color} strokeWidth="2" />
      <circle cx="114" cy="50" r="10" fill={style.lens === 'none' ? 'none' : style.lens} stroke={style.color} strokeWidth="2" />
      <line x1="96" y1="50" x2="104" y2="50" stroke={style.color} strokeWidth="2" />
    </g>
  );
}

function Hair({ stage, skinTone }: { stage: HairStage; skinTone: SkinTone }) {
  // Hair shape maps to the stage:
  // Fresh → tight fade (small)
  // Neat → tidy (slightly bigger)
  // Growing → noticeable
  // Overdue → clearly overgrown
  // Violation → very long, messy

  const hairColor = '#1a1a1a';

  switch (stage) {
    case 'Fresh':
      // Tight fade — small cap of hair
      return <path d="M 72 42 Q 100 20 128 42 L 128 48 Q 100 30 72 48 Z" fill={hairColor} />;
    case 'Neat':
      // Tidy — slightly fuller
      return <path d="M 70 40 Q 100 15 130 40 L 130 50 Q 100 28 70 50 Z" fill={hairColor} />;
    case 'Growing':
      // Noticeably fuller — starts to come down sides
      return <path d="M 68 38 Q 100 10 132 38 L 132 56 Q 126 40 100 30 Q 74 40 68 56 Z" fill={hairColor} />;
    case 'Overdue':
      // Overgrown — hair covering ears
      return <path d="M 66 36 Q 100 5 134 36 L 134 64 Q 128 46 100 32 Q 72 46 66 64 Z" fill={hairColor} />;
    case 'Violation':
      // Very long, messy — hair well past the head
      return <path d="M 64 34 Q 100 0 136 34 L 140 76 Q 132 50 100 30 Q 68 50 60 76 Z" fill={hairColor} opacity="0.95" />;
    default:
      return null;
  }
}

// ── Helper exports for onboarding ────────────────────────────────────────

export const BODY_TYPES: { code: BodyType; label: string; emoji: string }[] = [
  { code: 'slim', label: 'Slim', emoji: '🧍' },
  { code: 'medium', label: 'Medium', emoji: '🧍' },
  { code: 'full', label: 'Full', emoji: '🧍' },
];

export const SKIN_TONES_LIST: { code: SkinTone; label: string }[] = [
  { code: '#FDDBB4', label: 'Light' },
  { code: '#EAC086', label: 'Fair' },
  { code: '#D4956A', label: 'Medium' },
  { code: '#9C6035', label: 'Tan' },
  { code: '#6B3E20', label: 'Deep' },
  { code: '#3D1C0A', label: 'Dark' },
];
