import { useEffect, useRef } from 'preact/hooks';
import type { Destination, DestinationId, SourceTerm } from '../state/types';

interface Props {
  term: SourceTerm;
  destinations: readonly Destination[];
  onChoose: (destination: DestinationId) => void;
  onCancel: () => void;
}

/** Destination chooser used from the Unassigned tab, where there is no implicit target. */
export function AssignTermDialog({ term, destinations, onChoose, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    firstRef.current?.focus();
    const onCancelEvent = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    dialog.addEventListener('cancel', onCancelEvent);
    return () => dialog.removeEventListener('cancel', onCancelEvent);
  }, [onCancel]);

  return (
    <dialog ref={ref} class="ltb-dialog" aria-labelledby="ltb-assign-title" onClick={(e) => e.target === ref.current && onCancel()}>
      <div class="ltb-dialog-body">
        <h2 id="ltb-assign-title" class="ltb-dialog-title">
          Assign “{term.name}” to…
        </h2>
        <div class="ltb-assign-options">
          {destinations.map((d, i) => (
            <button
              key={d.id}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              class="ltb-assign-option"
              data-destination={d.id}
              onClick={() => onChoose(d.id)}
            >
              <span class="ltb-swatch" aria-hidden="true" />
              {d.name}
            </button>
          ))}
        </div>
        <div class="ltb-dialog-actions">
          <button type="button" class="ltb-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
