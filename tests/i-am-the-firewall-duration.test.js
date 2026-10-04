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

// The real paths: a new Initiative Pass (handleIniPass) and a new round (handleNextRound, after the new initiative roll)
describe("I Am the Firewall through the combat flow", () => {
  let grunt, flow
  beforeEach(() => {
    grunt = actor("grunt", [])
    const make = (id, a, initiative) => ({
      id, actorId: id, name: id, actor: a, initiative, isDefeated: false, update: vi.fn(async function (d){
        if ("initiative" in d) this.initiative = d.initiative
      })
    })
    const list = [make("hacker", hacker, 20), make("ally", ally, 15), make("grunt", grunt, 5)]
    flow = {
      id: "c1", combatants: list, turn: 0,
      get turns(){
        return [...list].sort((a, b) => b.initiative - a.initiative)
      },
      get combatant(){
        return this.turns[this.turn]
      },
      update: vi.fn(async function (d){
        if ("turn" in d) this.turn = d.turn
      }),
      resetAll: vi.fn(),
      rollAll: vi.fn(),
    }
    for (let c of list) c.combat = flow
    globalThis.game.combats = {
      get: () => flow
    }
    vi.spyOn(SR5Combat, "setInitiativePass").mockResolvedValue()
    vi.spyOn(SR5Combat, "resetActionInCombat").mockResolvedValue()
    vi.spyOn(SR5Combat, "manageTurnEnd").mockResolvedValue()
  })

  it("ends at the hacker's turn in the next pass, not later", async () => {
    // hacker 20 / ally 15 / grunt 5: in pass 2 the hacker (10) acts first again
    await SR5Combat.handleIniPass("c1")
    expect(flow.combatant.actorId).toBe("hacker")
    expect(ally.items.map(i => i.id)).not.toContain("iatf")
  })

  it("survives a pass the hacker does not reach", async () => {
    flow.combatants[0].initiative = 8
    await SR5Combat.handleIniPass("c1")
    expect(flow.combatant.actorId).toBe("ally")
    expect(ally.items.map(i => i.id)).toContain("iatf")
  })

  it("is still there in a new round where the ally rolls ahead of the hacker", async () => {
    flow.rollAll.mockImplementation(async () => {
      flow.combatants[0].initiative = 9
      flow.combatants[1].initiative = 18
    })
    await SR5Combat.handleNextRound("c1")
    expect(flow.combatant.actorId).toBe("ally")
    expect(ally.items.map(i => i.id)).toContain("iatf")
  })
})
