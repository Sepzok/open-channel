/**
 * In-page walk match for Pages demos (no WebSocket server).
 */
(function (global) {
  'use strict';

  let state = { pos: {}, ticks: 0 };
  /** @type {Record<string, function>} */
  const listeners = {};

  function reduce(prev, batch) {
    const pos = Object.assign({}, prev.pos);
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const cur = Object.assign({}, pos[item.actorId] || { x: 0, y: 0 });
      const dir = item.payload[0] || 0;
      if (dir === 0) cur.x -= 1;
      else if (dir === 1) cur.x += 1;
      else if (dir === 2) cur.y -= 1;
      else if (dir === 3) cur.y += 1;
      pos[item.actorId] = cur;
    }
    return { pos: pos, ticks: prev.ticks + 1 };
  }

  function broadcast() {
    const keys = Object.keys(listeners);
    for (let i = 0; i < keys.length; i++) {
      const fn = listeners[keys[i]];
      if (fn) fn(state);
    }
  }

  global.OCP_WALK_DEMO = {
    openPlayer: function (actorId, _admission, applyState) {
      listeners[actorId] = applyState;
      if (!state.pos[actorId]) {
        state.pos[actorId] = { x: actorId === 'u_zhou' ? 2 : -2, y: 0 };
        broadcast();
      } else {
        applyState(state);
      }
      return {
        sendDir: function (dir) {
          state = reduce(state, [{ actorId: actorId, payload: [dir] }]);
          broadcast();
        },
      };
    },
    reset: function () {
      state = { pos: {}, ticks: 0 };
      for (const k of Object.keys(listeners)) delete listeners[k];
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
