import { useEffect, useRef } from 'preact/hooks';
import { destinationName } from '../state/destinations';
import type { PendingTermMove, SourceTerm } from '../state/types';

interface Props {
  move: PendingTermMove;
  term: SourceTerm | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MoveTermDialog({ move, term, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    confirmRef.current?.focus();
    const onCancelEvent = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    dialog.addEventListener('cancel', onCancelEvent);
    return () => dialog.removeEventListener('cancel', onCancelEvent);
  }, [onCancel]);

  const name = term?.name ?? move.termKey;
  return (
    <dialog ref={ref} class="ltb-dialog" aria-labelledby="ltb-move-title" onClick={(e) => e.target === ref.current && onCancel()}>
      <form method="dialog" class="ltb-dialog-body" onSubmit={(e) => e.preventDefault()}>
        <h2 id="ltb-move-title" class="ltb-dialog-title">
          Move “{name}” from {destinationName(move.fromCategory)} to {destinationName(move.toCategory)}?
        </h2>
        <p class="ltb-dialog-text">A term can belong to only one destination category. Moving it removes it from {destinationName(move.fromCategory)}.</p>
        <div class="ltb-dialog-actions">
          <button type="button" class="ltb-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" class="ltb-btn ltb-btn-primary" ref={confirmRef} onClick={onConfirm}>
            Move
          </button>
        </div>
      </form>
    </dialog>
  );
}
