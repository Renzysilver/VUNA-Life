/**
 * ProfileAvatar — fetches avatar config + equipped items + renders the
 * AvatarRenderer at the specified size. Used on Profile (large), Who Is
 * Here (tiny), and Day Summary (small).
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AvatarRenderer, type AvatarConfig, type EquippedItems, type HairStage } from '@/components/avatar/avatar-renderer';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  size?: 'tiny' | 'small' | 'large';
  /** If provided, uses this config instead of fetching. Used for day
   *  summary snapshots + who-is-here (friend's equipped items). */
  overrideConfig?: AvatarConfig | null;
  overrideEquipped?: EquippedItems | null;
  overrideHair?: HairStage | null;
  /** If true, shows a grey silhouette (non-friend in who-is-here). */
  greySilhouette?: boolean;
};

export function ProfileAvatar({
  size = 'large',
  overrideConfig,
  overrideEquipped,
  overrideHair,
  greySilhouette = false,
}: Props) {
  const [config, setConfig] = useState<AvatarConfig | null>(overrideConfig ?? null);
  const [equipped, setEquipped] = useState<EquippedItems | null>(overrideEquipped ?? null);
  const [loading, setLoading] = useState(!overrideConfig && !greySilhouette);

  const reload = useCallback(() => {
    if (overrideConfig || greySilhouette) { return () => {}; }
    let cancelled = false;
    fetch('/api/wardrobe/items', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d.ok) return;
        const cfg = d.avatarConfig;
        if (cfg && cfg.bodyType) {
          setConfig(cfg as AvatarConfig);
        }
        // Convert equipped item IDs to variant strings
        const variants: EquippedItems = {};
        for (const [layer, itemId] of Object.entries(d.equipped || {})) {
          const item = (d.items as any[]).find((i) => i.id === itemId);
          if (item) {
            (variants as any)[layer] = item.variant;
          }
        }
        setEquipped(variants);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [overrideConfig, greySilhouette]);

  useEffect(() => { return reload(); }, [reload]);

  if (greySilhouette) {
    return (
      <div className={`grid place-items-center ${size === 'tiny' ? 'w-10 h-16' : size === 'small' ? 'w-20 h-32' : 'w-[200px] h-[320px]'}`}>
        <svg width={size === 'tiny' ? 40 : size === 'small' ? 80 : 200} height={size === 'tiny' ? 64 : size === 'small' ? 128 : 320} viewBox="0 0 200 320">
          {/* Grey silhouette — no outfit visible, no skin tone, no features */}
          <circle cx="100" cy="50" r="32" fill="#9CA3AF" opacity="0.4" />
          <rect x="92" y="78" width="16" height="14" fill="#9CA3AF" opacity="0.4" />
          <rect x="70" y="92" width="60" height="90" rx="8" fill="#9CA3AF" opacity="0.4" />
          <rect x="58" y="95" width="12" height="75" rx="6" fill="#9CA3AF" opacity="0.4" />
          <rect x="130" y="95" width="12" height="75" rx="6" fill="#9CA3AF" opacity="0.4" />
          <rect x="74" y="182" width="24" height="90" rx="6" fill="#9CA3AF" opacity="0.4" />
          <rect x="102" y="182" width="24" height="90" rx="6" fill="#9CA3AF" opacity="0.4" />
        </svg>
      </div>
    );
  }

  if (loading) return <Skeleton className={size === 'tiny' ? 'w-10 h-16' : size === 'small' ? 'w-20 h-32' : 'w-[200px] h-[320px]'} />;

  if (!config) {
    return (
      <div className={`grid place-items-center ${size === 'tiny' ? 'w-10 h-16' : size === 'small' ? 'w-20 h-32' : 'w-[200px] h-[320px]'} rounded-xl bg-muted`}>
        <span className="text-[10px] text-muted-foreground">Not set</span>
      </div>
    );
  }

  return (
    <AvatarRenderer
      config={config}
      equipped={equipped}
      hairStage={overrideHair ?? 'Fresh'}
      size={size}
    />
  );
}
