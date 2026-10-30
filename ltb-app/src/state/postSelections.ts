import type { AppState, DestinationId, PostSelection } from './types';

export function selectedDestinations(state: Pick<AppState, 'postSelections'>, postId: number): DestinationId[] {
  const selection = state.postSelections[postId];
  return selection === undefined ? [] : Array.isArray(selection) ? selection : [selection];
}

export function packSelection(destinations: DestinationId[]): PostSelection | undefined {
  if (destinations.length > 2) throw new Error('A post can have at most two destination categories.');
  return destinations.length === 2 ? [destinations[0]!, destinations[1]!] : destinations[0];
}
