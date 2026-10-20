import { createContext } from 'preact';
import { useContext, useReducer } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { createInitialState, reducer, type Action } from './reducer';
import type { AppState } from './types';

interface StoreValue {
  state: AppState;
  dispatch: (action: Action) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ initialState, children }: { initialState: AppState; children: ComponentChildren }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

export { createInitialState };
