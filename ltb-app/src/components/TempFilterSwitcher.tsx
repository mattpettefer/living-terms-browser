import { useStore } from '../state/provider';

interface Props {
  /** Show add/remove/rename controls (Config); otherwise just switch between filters (Overview). */
  manage?: boolean;
}

/** Pills for every temporary filter; the highlighted one is active (applies to the Overview and receives edits). */
export function TempFilterSwitcher({ manage = false }: Props) {
  const { state, dispatch } = useStore();
  const { tempFilters, activeTempFilterId, tempFilterEnabled } = state;

  const rename = (id: string, current: string) => {
    const name = window.prompt('Filter name', current);
    if (name !== null) dispatch({ type: 'RENAME_TEMP_FILTER', filterId: id, name });
  };
  const remove = (id: string, name: string, count: number) => {
    if (count === 0 || window.confirm(`Remove “${name}” and its ${count} term${count === 1 ? '' : 's'}?`)) dispatch({ type: 'REMOVE_TEMP_FILTER', filterId: id });
  };

  return (
    <div class="ltb-tf-switcher" role="group" aria-label="Temporary filters">
      <span class={`ltb-tf-pill ltb-tf-none${tempFilterEnabled ? '' : ' is-active'}`}>
        <button
          type="button"
          class="ltb-tf-select"
          aria-pressed={!tempFilterEnabled}
          title="Show posts without applying a temporary filter"
          onClick={() => dispatch({ type: 'SET_TEMP_FILTER_ENABLED', enabled: false })}
        >
          No Filter
        </button>
      </span>
      {tempFilters.map((f) => {
        const active = tempFilterEnabled && f.id === activeTempFilterId;
        return (
          <span key={f.id} class={`ltb-tf-pill${active ? ' is-active' : ''}`}>
            <button
              type="button"
              class="ltb-tf-select"
              aria-pressed={active}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TEMP_FILTER', filterId: f.id })}
              title="Activate this filter"
            >
              {f.name}
              <span class="ltb-tf-count" aria-label={`${(f.termKeys.length + (f.notTermKeys?.length ?? 0))} terms`}>
                {(f.termKeys.length + (f.notTermKeys?.length ?? 0))}
              </span>
            </button>
            <button
              type="button"
              class="ltb-tf-operator"
              aria-label={`${f.name}: require all terms (AND)`}
              aria-pressed={f.operator === 'AND'}
              title={`${f.operator === 'AND' ? 'AND: match every selected term. Switch to OR.' : 'OR: match any selected term. Switch to AND.'}`}
              onClick={() => dispatch({ type: 'SET_TEMP_FILTER_OPERATOR', filterId: f.id, operator: f.operator === 'AND' ? 'OR' : 'AND' })}
            >
              {f.operator}
            </button>
            {manage && (
              <button type="button" class="ltb-tf-remove ltb-tf-rename" aria-label={`Rename ${f.name}`} title="Rename filter" onClick={() => rename(f.id, f.name)}>
                ✎
              </button>
            )}
            {manage && tempFilters.length > 1 && (
              <button type="button" class="ltb-tf-remove" aria-label={`Remove ${f.name}`} title="Remove filter" onClick={() => remove(f.id, f.name, (f.termKeys.length + (f.notTermKeys?.length ?? 0)))}>
                ×
              </button>
            )}
          </span>
        );
      })}
      {manage && (
        <button type="button" class="ltb-tf-add" onClick={() => dispatch({ type: 'ADD_TEMP_FILTER' })}>
          + New filter
        </button>
      )}
    </div>
  );
}
