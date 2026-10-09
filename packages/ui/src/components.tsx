import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { playerColors } from './tokens.js';

type Tone = 'yellow' | 'green' | 'coral' | 'ghost';

export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  icon?: ReactNode;
}

/** A big, chunky button. Always at least 56px tall. */
export function BigButton({ tone = 'yellow', icon, children, className, ...rest }: BigButtonProps) {
  return (
    <button type="button" className={`fd-btn fd-btn--${tone} ${className ?? ''}`} {...rest}>
      {icon ? (
        <span className="fd-btn__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

/** Player chip: colour + shape + name. */
export function PlayerTag({ index, name }: { index: number; name: string }) {
  const p = playerColors[index % playerColors.length]!;
  return (
    <span className="fd-player" style={{ ['--fd-player' as string]: p.color }}>
      <span className="fd-player__shape" aria-hidden="true">
        {p.shape}
      </span>
      {name}
    </span>
  );
}

/** A huge number for the play screen. */
export function BigNumber({ value, label, unit }: { value: string; label: string; unit?: string }) {
  return (
    <div className="fd-bignum" role="status" aria-label={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
      <span className="fd-bignum__value">{value}</span>
      {unit ? <span className="fd-bignum__unit">{unit}</span> : null}
      <span className="fd-bignum__label">{label}</span>
    </div>
  );
}
