import { useSelectTermGroup } from '../effects/useSelectTermGroup';
import { GroupedTerms } from './GroupedTerms';
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
  const selectGroup = useSelectTermGroup();
  const rows = [
    { id: 'match', label: 'MATCH · ' + (destination ? 'OR' : filter.operator), keys: destination ? getAssignedTermKeys(state.assignments, destination) : filter.termKeys, empty: destination ? 'No matching terms assigned' : 'No matching terms required' },
    { id: 'not', label: 'NOT', keys: (destination ? state.destinationExclusions[destination] : filter.notTermKeys) ?? [], empty: 'No terms excluded' },
  ] as const;
  const remove = (line: 'match' | 'not', key: TermKey) => {
    if (destination) {
      if (line === 'not') dispatch({ type: 'TOGGLE_DESTINATION_NOT_TERM', destination, termKey: key });
      else if (state.assignments[key] === destination) dispatch({ type: 'UNASSIGN_TERM', termKey: key });
      else if (state.assignments[key]) dispatch({ type: 'OPEN_MOVE', termKey: key, fromCategory: state.assignments[key]!, toCategory: destination });
      else dispatch({ type: 'ASSIGN_TERM', termKey: key, destination });
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
            <GroupedTerms keys={row.keys} onSelectAll={(keys) => selectGroup(keys, row.id, destination)} isSelected={(key) => row.keys.includes(key)} renderTerm={(term, grouped) => {
              const key = term.key;
              const selected = row.keys.includes(key);
              const opposite = rows.find((r) => r.id !== row.id)!.keys.includes(key);
              const name = term.name;
              const verb = selected ? 'Remove ' : 'Add ';
              const label = verb + name + (selected ? ' from ' : ' to ') + (row.id === 'not' ? 'NOT' : 'matching terms');
              return (
                <button key={key} type="button" class={'ltb-term ltb-term-sm is-filter' + (selected ? ' is-selected' : '')}
                  disabled={state.excludedTermKeys.includes(key) || !state.termsByKey[key] && !selected}
                  aria-pressed={selected}
                  aria-label={label + (showPostCounts && !grouped ? ', ' + postCountLabel(term.sourceCount) : '')}
                  title={label + (opposite ? ' (currently in ' + (row.id === 'match' ? 'NOT' : 'MATCH') + ')' : '')}
                  onClick={() => remove(row.id, key)}>
                  <span class="ltb-term-label">{name}</span>
                  {opposite && <small>{row.id === 'match' ? 'NOT' : 'MATCH'}</small>}
                  {showPostCounts && !grouped && <TermPostCount count={term.sourceCount} />}
                  <span class="ltb-term-x" aria-hidden="true">{selected ? '×' : '+'}</span>
                </button>
              );
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}
