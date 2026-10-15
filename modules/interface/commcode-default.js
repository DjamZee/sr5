// Relecture djamz.13 (arbitrage de DjamZ): every communication device set on a character has a commcode of its own,
// #XX-XXXX-XXXX-XX. A new one gets it at its creation (entityItem.js); those already in the world get it here, once,
// from the active gamemaster. The rules are in system/commcode-rules.js.
import {
  needsCommcode, generateCommcode
} from "../system/commcode-rules.js"

/** The commcodes already given in the world: the devices of the actors, and those of the tokens of the scenes */
export function worldCommcodes() {
  const codes = []
  const read = actor => {
    for (const item of actor?.items ?? []) if (item.type === "itemDevice" && item.system?.commcode) codes.push(item.system.commcode)
  }
  for (const actor of game.actors ?? []) read(actor)
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink) read(token.actor)
  return codes
}

/** The devices of the world's actors that have none get one; the active gamemaster writes them, at the start */
export async function fillMissingCommcodes() {
  if (!game.user?.isActiveGM) return
  const taken = worldCommcodes()
  for (const actor of game.actors ?? []) {
    const updates = []
    for (const item of actor.items) {
      if (!needsCommcode(item, actor.type)) continue
      const commcode = generateCommcode(taken)
      if (!commcode) continue
      taken.push(commcode)
      updates.push({
        _id: item.id, "system.commcode": commcode
      })
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates, {
      render: false
    })
  }
}
