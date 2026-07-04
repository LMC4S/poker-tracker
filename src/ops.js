// Every mutation the UI can make, expressed as a small operation:
//   { opId, sessionId, type, payload: { ...fields, at } }
// This module applies them, and it runs in two places: on the client for
// instant optimistic UI, and in api/op.js for the authoritative write. One
// implementation on both sides means a replayed op produces the same session
// either place — including log entries and updatedAt, which are stamped from
// the op's own `at` timestamp rather than the applying machine's clock.
//
// Must stay dependency-free and browser/node-neutral: api/ imports it too.

const logEvent = (s, t, type, player, amount) => {
  s.log = [...(s.log || []), { t, type, player, ...(amount != null ? { amount } : {}) }];
};

// Derives a session's endDate from the latest cash-out still in effect.
// Players forget to hit "End Session", so the real end time is when the last
// player cashed out.
const recomputeEndDate = (s) => {
  const times = s.players.filter(p => p.cashout !== null && p.cashoutAt).map(p => p.cashoutAt).sort();
  s.endDate = times.length ? times[times.length - 1] : null;
};

// Builds a fresh session from a createSession op
export function makeSession(op) {
  const { name, date, shareToken, at } = op.payload;
  return { id: op.sessionId, name, date, updatedAt: at || date, players: [], log: [], ended: false, shareToken };
}

// Applies one op to a session, returning a new object. Returns the original
// reference untouched when the op doesn't apply (unknown player, duplicate
// name, already ended) — callers can treat that as a successful no-op.
export function applyOp(session, op) {
  const payload = op.payload || {};
  const at = payload.at || new Date().toISOString();
  const s = { ...session, players: session.players.map(p => ({ ...p, buyins: [...p.buyins] })) };

  switch (op.type) {
    case "addPlayer": {
      if (s.players.some(p => p.name.toLowerCase() === payload.name.toLowerCase())) return session;
      s.players = [...s.players, { id: payload.playerId, name: payload.name, buyins: payload.buyin > 0 ? [payload.buyin] : [], cashout: null }];
      logEvent(s, at, "join", payload.name, payload.buyin > 0 ? payload.buyin : null);
      break;
    }
    case "rebuy": {
      const p = s.players.find(x => x.id === payload.playerId);
      if (!p) return session;
      p.buyins.push(payload.amount);
      logEvent(s, at, "buyin", p.name, payload.amount);
      break;
    }
    case "cashout": {
      const p = s.players.find(x => x.id === payload.playerId);
      if (!p) return session;
      p.cashout = payload.amount;
      p.cashoutAt = at;
      logEvent(s, at, "cashout", p.name, payload.amount);
      recomputeEndDate(s);
      break;
    }
    case "editCashout": {
      // Corrects the amount of an existing cash-out. cashoutAt is deliberately
      // untouched: the original time stands, so a next-day fix never shifts
      // the session's derived end date. "Player got back in" is undoCashout.
      const p = s.players.find(x => x.id === payload.playerId);
      if (!p || p.cashout === null || typeof payload.amount !== "number" || payload.amount < 0 || payload.amount === p.cashout) return session;
      p.cashout = payload.amount;
      logEvent(s, at, "edit", p.name, payload.amount);
      break;
    }
    case "undoCashout": {
      const p = s.players.find(x => x.id === payload.playerId);
      if (!p) return session;
      p.cashout = null;
      p.cashoutAt = null;
      logEvent(s, at, "undo", p.name);
      recomputeEndDate(s);
      break;
    }
    case "renamePlayer": {
      const p = s.players.find(x => x.id === payload.playerId);
      const name = (payload.name || "").trim();
      if (!p || !name || name === p.name) return session;
      if (s.players.some(x => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase())) return session;
      s.log = [...(s.log || []), { t: at, type: "rename", player: p.name, to: name }];
      p.name = name;
      break;
    }
    case "removePlayer": {
      const p = s.players.find(x => x.id === payload.playerId);
      if (!p) return session;
      s.players = s.players.filter(x => x.id !== payload.playerId);
      logEvent(s, at, "remove", p.name);
      recomputeEndDate(s);
      break;
    }
    case "endSession": {
      if (s.ended) return session;
      s.ended = true;
      // endDate is auto-derived from the last cash-out; only fall back to the
      // op time if nobody cashed out
      s.endDate = s.endDate || at;
      break;
    }
    case "reopenSession": {
      if (!s.ended) return session;
      s.ended = false;
      break;
    }
    case "revokeShare": {
      s.shareToken = null;
      break;
    }
    case "regenerateShare": {
      s.shareToken = payload.shareToken;
      break;
    }
    default:
      return session;
  }

  s.updatedAt = at;
  return s;
}

// Applies one op to a session list (client-side optimistic update).
// createSession and deleteSession change the list itself; everything else
// maps onto the one session it targets.
export function applyOpToList(sessions, op) {
  if (op.type === "createSession") return [makeSession(op), ...sessions];
  if (op.type === "deleteSession") return sessions.filter(s => s.id !== op.sessionId);
  return sessions.map(s => s.id === op.sessionId ? applyOp(s, op) : s);
}
