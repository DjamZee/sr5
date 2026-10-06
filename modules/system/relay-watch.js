// A request a player's browser relays to the active GM (socket.js, emitForGM) dies with him when he leaves before
// answering it: damage on his NPC waiting for his yes, a heal, a card he reads again (Marta's F7, Quitterie's S5).
// DjamZ's ruling (séance F, 06/10): the player is told that the request did not go through and is to click again;
// nothing is replayed and nothing is queued, so nothing can be applied twice. The GM's browser acknowledges each
// request once its handlers are done, his answer included; what is still waiting when that GM disconnects is lost

const pending = new Map()
let counter = 0

// What the player is told the request was about
const KINDS = {
  takeDamage: "SR5.RelayKindDamage",
  heal: "SR5.RelayKindHeal",
  applyHealEffect: "SR5.RelayKindHeal",
}

/** Note a request sent to a GM; the id travels with the message and comes back in the acknowledgment. */
export function trackRelay(type, gmId) {
  const relayId = `${Date.now().toString(36)}-${++counter}`
  pending.set(relayId, {
    type, gmId
  })
  return relayId
}

/** The GM's browser is done with a request (socket "relayDone"). */
export function relayDone(message) {
  return pending.delete(message?.data?.relayId)
}

/** A GM disconnects: every request of this browser still waiting on him is lost, and said so. */
export function onUserConnected(user, connected) {
  if (connected || !user?.isGM) return 0
  let lost = 0
  for (const [relayId, request] of pending) {
    if (request.gmId !== user.id) continue
    pending.delete(relayId)
    lost++
    ui.notifications.warn(game.i18n.format("SR5.WARN_RelayLost", {
      gm: user.name ?? "", kind: game.i18n.localize(KINDS[request.type] ?? "SR5.RelayKindAction")
    }), {
      permanent: true
    })
  }
  return lost
}

/** For the tests */
export function pendingRelays() {
  return pending.size
}
