import { useState } from 'react';
import type { Asset } from './assets.js';

/** An image from the asset map. If it fails to load, shows its emoji + text instead. */
export function Art({
  asset,
  size,
  decorative = false,
  className,
}: {
  asset: Asset;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        className={`art-fallback ${className ?? ''}`}
        style={size ? { width: size, height: size, fontSize: size * 0.45 } : undefined}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : asset.alt}
        aria-hidden={decorative || undefined}
      >
        {asset.fallback}
        {!decorative && asset.alt ? <small>{asset.alt}</small> : null}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={asset.src}
      alt={decorative ? '' : asset.alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}
