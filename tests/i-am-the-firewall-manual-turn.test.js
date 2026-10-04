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

// N73, Kill Code p. 43: the I Am the Firewall bonus ends at the start of the hacker's next pass,
// also when the gamemaster sets the turn by hand (previous turn, turn chosen in the tracker).

const effect = (id, ownerID) => ({
  id, uuid: `Actor.ally.Item.${id}`, type: "itemEffect", name: id, system: {
    type: "iAmTheFirewall", ownerID, durationType: "initiativePass", duration: 1
  }, update: vi.fn()
})

let ally, combat
beforeEach(() => {
  Combat.prototype._onUpdate ??= function(){}
  globalThis.ui = {
    notifications: {
      info: vi.fn()
    }
  }
  globalThis.game.user = {
    isActiveGM: true
  }
  const items = [effect("iatf", "hacker")]
  ally = {
    id: "ally", items, deleteEmbeddedDocuments: vi.fn(async (t, ids) => {
      await Promise.resolve()
      for (let i of ids) items.splice(items.findIndex(x => x.id === i), 1)
    })
  }
  const combatants = [{
    actorId: "hacker", name: "Hacker", actor: {
      id: "hacker", items: []
    }
  }, {
    actorId: "ally", name: "Ally", actor: ally
  }]
  combat = Object.create(SR5Combat.prototype, {
    combatants: {
      value: combatants
    },
    combatant: {
      value: combatants[0]
    },
  })
  for (let c of combatants) c.combat = combat
  vi.spyOn(SR5Combat, "getActorFromCombatant").mockImplementation(c => c.actor)
})

const flush = () => new Promise(r => setTimeout(r, 0))

describe("I Am the Firewall and a turn set by hand", () => {
  it("ends when the gamemaster moves the turn onto the hacker", async () => {
    combat._onUpdate({
      turn: 0
    }, {
    }, "gm")
    await flush()
    expect(ally.items.map(i => i.id)).not.toContain("iatf")
  })

  it("deletes the effect once when the system ends it at the same time", async () => {
    combat._onUpdate({
      turn: 0
    }, {
    }, "gm")
    await SR5Combat.endOwnerPassEffects(combat, combat.combatant)
    await flush()
    expect(ally.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1)
  })

  it("does nothing on an update that leaves the turn alone", async () => {
    combat._onUpdate({
      round: 2
    }, {
    }, "gm")
    await flush()
    expect(ally.items.map(i => i.id)).toContain("iatf")
  })

  // The first combatant of the OLD order is not the one who starts the new round: the initiative is rolled again
  it("keeps the bonus through a new round (nextRound, then resetAll)", async () => {
    combat._onUpdate({
      round: 4, turn: 0
    }, {
    }, "gm")
    combat._onUpdate({
      turn: 0
    }, {
      turnEvents: false, diff: false
    }, "gm")
    await flush()
    expect(ally.items.map(i => i.id)).toContain("iatf")
  })
})
