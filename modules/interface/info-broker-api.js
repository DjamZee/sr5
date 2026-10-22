// The information broker for the modules (landing-metroplexes-sr5, NETWORKS): game.sr5.infoBroker. A module opens the
// window (info-broker.js, lot 37a, Cutting Aces p. 148-149) through here instead of importing it by its path, which may
// move. The window is loaded when called; every request in it still goes through the active gamemaster.

import {
  actorOf
} from "../system/matrix-api.js"

const BROKER_TABS = ["buy", "sell", "requests"]

/** The buyer the window is opened for: an actor the user owns (any for the gamemaster), else none (she picks one) */
export function brokerBuyer(actor, user = globalThis.game?.user){
  if (!actor) return null
  return user?.isGM || actor.isOwner ? actor : null
}

/**
 * game.sr5.infoBroker:
 * - open({vendor, buyer, tab}): the window, at a vendor's (an actor, a token or a uuid; none: the broker of the
 *   table), for a buyer the user owns (none, or one she does not own: the first of hers); tab "buy", "sell" or "requests".
 *   Answers the window once it is drawn.
 */
export const infoBrokerApi = () => Object.freeze({
  tabs: Object.freeze([...BROKER_TABS]),
  open: async ({
    vendor = null, buyer = null, tab = null
  } = {
  }) => {
    const [seller, owner] = await Promise.all([actorOf(vendor), actorOf(buyer)])
    const {
      SR5InfoBrokerApp
    } = await import("./info-broker.js")
    return SR5InfoBrokerApp.open({
      vendor: seller, buyer: brokerBuyer(owner), tab: BROKER_TABS.includes(tab) ? tab : null
    })
  },
})
