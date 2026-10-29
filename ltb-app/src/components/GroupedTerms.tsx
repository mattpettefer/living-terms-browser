import type { ComponentChildren } from 'preact';
import { useStore } from '../state/provider';
import { displayTerm, groupTerms, type DisplayTermGroup } from '../state/mergers';
import type { SourceTerm, TermKey } from '../state/types';
import { TermPostCount } from './TermPostCount';

export function GroupedTerms({ keys, groups, isSelected, onSelectAll, renderTerm, countLabel }: {
  keys?: readonly TermKey[];
  groups?: DisplayTermGroup[];
  countLabel?: (count: number | null) => string;
  onSelectAll?: (keys: TermKey[], name: string) => void;
  isSelected?: (key: TermKey) => boolean;
  renderTerm: (term: SourceTerm, grouped: boolean, present: boolean) => ComponentChildren;
}) {
  const { state } = useStore();
  return <>{(groups ?? groupTerms(state, keys ?? [])).map((group) => group.merger ? (
    <div key={group.id} class="ltb-merger-bar" role="group" aria-label={group.merger.name}>
      {onSelectAll ? <button type="button" class="ltb-merger-heading ltb-merger-select-all"
        aria-label={'Select all members of ' + group.merger.name} title="Select all members in this group"
        disabled={!group.keys.some((key) => state.termsByKey[key] && !state.excludedTermKeys.includes(key))}
        onClick={() => onSelectAll(group.keys, group.merger!.name)}><strong>{group.merger.name}</strong></button>
        : <span class="ltb-merger-heading"><strong>{group.merger.name}</strong></span>}
      <div class="ltb-merger-members">
        {group.keys.map((key) => <span key={key} class={'ltb-merger-member' + (!(isSelected ? isSelected(key) : group.present.has(key)) ? ' is-dimmed' : '')}>
          {renderTerm(displayTerm(state, key), true, group.present.has(key))}
        </span>)}
      </div>
      <span class="ltb-merger-total"><TermPostCount count={group.count} label={countLabel?.(group.count)} /><span>posts</span></span>
    </div>
  ) : renderTerm(displayTerm(state, group.keys[0]!), false, true))}</>;
}
