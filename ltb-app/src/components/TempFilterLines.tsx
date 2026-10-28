import { TermPostCount, postCountLabel } from './TermPostCount';
import { useStore } from '../state/provider';
import type { DestinationId, TermKey } from '../state/types';
import { getAssignedTermKeys, getActiveTempFilter } from '../state/selectors';

interface Props {
  destination?: DestinationId;
  showPostCounts?: boolean;
  editing?: 'match' | 'not';
  onEdit?: (line: 'match' | 'not') => void;
}

/** The positive match and negative exclusion rules for the active named filter. */
export function TempFilterLines({ editing, onEdit, destination, showPostCounts = false }: Props) {
  const { state, dispatch } = useStore();
  const filter = getActiveTempFilter(state);
  const rows = [
    { id: 'match', label: 'MATCH · ' + (destination ? 'OR' : filter.operator), keys: destination ? getAssignedTermKeys(state.assignments, destination) : filter.termKeys, empty: destination ? 'No matching terms assigned' : 'No matching terms required' },
    { id: 'not', label: 'NOT', keys: (destination ? state.destinationExclusions[destination] : filter.notTermKeys) ?? [], empty: 'No terms excluded' },
  ] as const;
  const remove = (line: 'match' | 'not', key: TermKey) => {
    if (destination) {
      if (line === 'not') dispatch({ type: 'TOGGLE_DESTINATION_NOT_TERM', destination, termKey: key });
      else dispatch({ type: 'UNASSIGN_TERM', termKey: key });
    } else dispatch({ type: line === 'not' ? 'TOGGLE_TEMP_FILTER_NOT_TERM' : 'TOGGLE_TEMP_FILTER_TERM', termKey: key });
  };
  return (
    <div class="ltb-filter-lines">
      {rows.map((row) => (
        <div key={row.id} class={'ltb-filter-line' + (row.id === 'not' ? ' is-not' : '') + (editing === row.id ? ' is-editing' : '')}>
          {onEdit ? (
            <button type="button" class="ltb-filter-line-label" aria-label={row.id === 'not' ? 'Edit NOT terms' : 'Edit matching terms'}
              aria-pressed={editing === row.id} onClick={() => onEdit(row.id)}>{row.label}</button>
          ) : <span class="ltb-filter-line-label">{row.label}</span>}
          <div class="ltb-filter-line-terms">
            {row.keys.length === 0 && <span class="ltb-muted">{row.empty}{editing === row.id ? ' — choose terms below' : ''}</span>}
            {row.keys.map((key) => {
              const term = state.termsByKey[key];
              const name = term?.name ?? key;
              return (
                <button key={key} type="button" class="ltb-term ltb-term-sm is-filter is-selected"
                  aria-label={'Remove ' + name + ' from ' + (row.id === 'not' ? 'NOT' : 'matching terms') + (showPostCounts ? ', ' + postCountLabel(term?.sourceCount) : '')}
                  title={'Remove ' + name + ' from ' + row.label}
                  onClick={() => remove(row.id, key)}>
                  <span class="ltb-term-label">{name}</span>
                  {showPostCounts && <TermPostCount count={term?.sourceCount} />}
                  <span class="ltb-term-x" aria-hidden="true">×</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
