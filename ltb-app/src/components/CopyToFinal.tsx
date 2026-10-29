import { useState } from 'preact/hooks';
import { useStore } from '../state/provider';
import { getFinalExcludedTermKeys } from '../state/finalTerms';
import { getAssignedTermKeys } from '../state/selectors';
import type { DestinationId } from '../state/types';

export function CopyToFinal({ destination }: { destination: DestinationId | 'all' }) {
  const { state, dispatch } = useStore();
  const [copied, setCopied] = useState(false);
  const excluded = getFinalExcludedTermKeys(state);
  const choices = state.destinationCategories.filter(d => destination === 'all' || d.id === destination).map(d => ({
    destination: d.id,
    keys: getAssignedTermKeys(state.assignments, d.id).filter(key => !state.excludedTermKeys.includes(key) && !excluded.has(key)),
  }));
  return <span class="ltb-final-copy">
    <button type="button" class="ltb-btn" disabled={!choices.some(choice => choice.keys.length)} onClick={() => {
      for (const choice of choices) dispatch({ type: 'SET_FINAL_TERMS', destination: choice.destination, termKeys: choice.keys, allowed: true });
      setCopied(true);
    }}>Copy from Overview</button>
    {copied && <span role="status" class="ltb-muted">Overview terms added to Final. Post selections unchanged.</span>}
  </span>;
}
