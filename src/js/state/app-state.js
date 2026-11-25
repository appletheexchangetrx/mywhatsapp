const initialState = {
  messages: [],
  conversations: new Map(),
  active: null,
  sending: false,
};

let state = { ...initialState };
const listeners = new Set();

export function getState() {
  return state;
}

export function setState(nextState) {
  state = { ...state, ...nextState };
  for (const listener of listeners) listener(state);
  return state;
}

export function updateState(updater) {
  const nextState = typeof updater === "function" ? updater(state) : updater;
  return setState(nextState || {});
}

export function subscribe(listener, { emitCurrent = true } = {}) {
  if (typeof listener !== "function") {
    throw new TypeError("State subscriber must be a function.");
  }

  listeners.add(listener);
  if (emitCurrent) listener(state);

  return () => listeners.delete(listener);
}

export function resetState() {
  state = { ...initialState, messages: [], conversations: new Map() };
  for (const listener of listeners) listener(state);
  return state;
}
