import { useId, useState } from 'preact/hooks';
import type { DestinationId, SourceTerm } from '../state/types';

export interface TermButtonProps {
  term: SourceTerm;
  /** Highlighted as owned by the current context (Config tab). */
  selected?: boolean;
  /** Flagged red because it contributes to a multi-destination overlap on an article. */
  warning?: boolean;
  /** Destination that owns this term; drives the color coding. */
  owner?: DestinationId | null;
  /** Tooltip text shown on hover, focus, and tap. */
  tooltip?: string | null;
  /** Secondary detail, e.g. source ID for duplicate labels. */
  detail?: string | null;
  disabled?: boolean;
  onClick?: (term: SourceTerm) => void;
}

/**
 * Uniform rounded control for a source term. Categories and tags look
 * identical; taxonomy is only exposed in the disambiguation detail.
 */
export function TermButton({ term, selected = false, warning = false, owner = null, tooltip, detail, disabled, onClick }: TermButtonProps) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const hasTip = !!tooltip || !!detail;
  const cls = ['ltb-term', selected && 'is-selected', owner && 'is-owned', warning && 'is-warning', open && hasTip && 'is-open']
    .filter(Boolean)
    .join(' ');

  const toggle = () => {
    if (onClick) onClick(term);
    else if (hasTip) setOpen((o) => !o);
  };

  return (
    <span class="ltb-term-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        class={cls}
        data-destination={owner ?? undefined}
        aria-pressed={onClick ? selected : undefined}
        aria-describedby={hasTip ? tipId : undefined}
        disabled={disabled}
        onClick={toggle}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {warning && (
          <span class="ltb-term-warning-icon" role="img" aria-label="Overlap warning">
            !
          </span>
        )}
        <span class="ltb-term-label">{term.name}</span>
      </button>
      {hasTip && (
        <span id={tipId} role="tooltip" class="ltb-tooltip" hidden={!open}>
          {tooltip}
          {detail && <span class="ltb-tooltip-detail">{detail}</span>}
        </span>
      )}
    </span>
  );
}
