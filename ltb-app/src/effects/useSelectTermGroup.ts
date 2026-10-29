import { useStore } from '../state/provider';
import { destinationName } from '../state/destinations';
import type { DestinationId, TermKey } from '../state/types';

/** Additive group selection uses the same original keys as individual buttons. */
export function useSelectTermGroup() {
  const { state, dispatch } = useStore();
  return (termKeys: TermKey[], line: 'match' | 'not', destination?: DestinationId) => {
    const keys = termKeys.filter((key) => state.termsByKey[key] && !state.excludedTermKeys.includes(key));
    if (destination) {
      const moving = line === 'match' ? keys.filter((key) => state.assignments[key] && state.assignments[key] !== destination) : [];
      if (moving.length && !window.confirm('Move ' + moving.length + ' group member(s) from their existing destination to ' + destinationName(destination) + '?')) return;
      dispatch({ type: 'SELECT_DESTINATION_TERMS', termKeys: keys, destination, line });
    } else dispatch({ type: 'SELECT_TEMP_FILTER_TERMS', termKeys: keys, line });
  };
}
