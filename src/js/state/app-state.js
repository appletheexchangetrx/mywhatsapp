const initialState = Object.freeze({
  messages: [],
  conversations: new Map(),
  active: null,
  sending: false,
});

let state = { ...initialState };
const listeners = new Set();

export function getState() {
  return state;
}

function notify() {
  const snapshot = state;
  const errors = [];
  for (const listener of [...listeners]) {
    try {
      listener(snapshot);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    queueMicrotask(() => {
      for (const error of errors) console.error("State subscriber failed:", error);
    });
  }
}

export function setState(nextState) {
  if (!nextState || typeof nextState !== "object") return state;
  state = { ...state, ...nextState };
  notify();
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
  if (emitCurrent) {
    try {
      listener(state);
    } catch (error) {
      console.error("State subscriber failed during initial emission:", error);
    }
  }
  return () => listeners.delete(listener);
}

export function resetState() {
  state = { ...initialState, messages: [], conversations: new Map() };
  notify();
  return state;
}
