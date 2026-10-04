import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5Combat
} from "../modules/system/srcombat.js"

// Kill Code p. 43: the I Am the Firewall bonus lasts until the start of the hacker's next Initiative Pass,
// even when that pass comes in the next combat round.

const effect = (id, ownerID, type = "iAmTheFirewall") => ({
  id, type: "itemEffect", name: id, system: {
    type, ownerID, durationType: "initiativePass", duration: 1
  }, update: vi.fn()
})

function actor(id, items){
  return {
    id, items, deleteEmbeddedDocuments: vi.fn(async (t, ids) => {
      for (let i of ids) items.splice(items.findIndex(x => x.id === i), 1)
    })
  }
}

let hacker, ally, combat
beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn()
    }
  }
  hacker = actor("hacker", [])
  ally = actor("ally", [effect("iatf", "hacker"), effect("other", "someone", "intervene")])
  const combatants = [{
    actorId: "hacker", name: "Hacker", actor: hacker
  }, {
    actorId: "ally", name: "Ally", actor: ally
  }]
  combat = {
    combatants
  }
  for (let c of combatants) c.combat = combat
  vi.spyOn(SR5Combat, "getActorFromCombatant").mockImplementation(c => c.actor)
})

describe("I Am the Firewall lasts until the hacker's next pass", () => {
  it("survives the end of a pass and a new round on the ally's side", async () => {
    await SR5Combat.decreaseInitiativePassEffects(combat.combatants[1])
    expect(ally.items.map(i => i.id)).toContain("iatf")
  })

  it("ends when the hacker's turn starts", async () => {
    await SR5Combat.endOwnerPassEffects(combat, combat.combatants[1])
    expect(ally.items.map(i => i.id)).toContain("iatf")
    await SR5Combat.endOwnerPassEffects(combat, combat.combatants[0])
    expect(ally.items.map(i => i.id)).not.toContain("iatf")
  })

  it("keeps the pass countdown when the hacker is not in the combat", async () => {
    combat.combatants.shift()
    await SR5Combat.decreaseInitiativePassEffects(combat.combatants[0])
    expect(ally.items.map(i => i.id)).not.toContain("iatf")
  })
})
