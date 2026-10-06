import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_CombatHelpers
} = await import("../modules/rolls/roll-helpers/combat.js")

// SR5 p. 183: the scatter moves the template of the shot. A card from before the shot kept its template id has no
// way to tell its circle from that of a later throw of the same item, and used to move the newest one.

let warned, updated, rolls

function template(id){
  return {
    id, x: 0, y: 0,
    flags: {
      sr5: {
        item: "grenade"
      }
    },
    canUserModify: () => true,
    update: async (data) => updated.push(data),
  }
}

beforeEach(() => {
  warned = []
  updated = []
  rolls = 0
  const list = [template("old"), template("new")]
  const templates = [...list]
  templates.get = (id) => list.find(t => t.id === id)
  globalThis.canvas = {
    scene: {
      templates, tokens: []
    },
    grid: {
      getTranslatedPoint: (o) => o
    },
  }
  globalThis.ui = {
    notifications: {
      warn: (m) => warned.push(m), info: () => {}
    }
  }
  globalThis.Roll = class {
    constructor(){
      rolls++
    }
    async evaluate(){
      this.total = 7
      return this
    }
  }
  game.actors = {
    get: () => ({
      items: [{
        id: "grenade", system: {
          category: "grenade"
        }
      }]
    })
  }
})

const cardWith = (grenade) => ({
  owner: {
    actorId: "a", itemId: "grenade"
  },
  roll: {
    hits: 0
  },
  combat: {
    grenade, ammo: {
      effects: {
      }
    }
  },
})

describe("scatter from a card older than template tracking", () => {
  it("moves no template and rolls no die", async () => {
    expect(await SR5_CombatHelpers.rollScatter(cardWith({
      isGrenade: true
    }))).toBe(false)
    expect(rolls).toBe(0)
    expect(updated).toEqual([])
    expect(warned).toEqual(["SR5.WARN_ScatterCardTooOld"])
  })

  it("a card that kept its template still moves that one", async () => {
    expect(await SR5_CombatHelpers.rollScatter(cardWith({
      isGrenade: true, templateId: "old"
    }))).toBe(7)
    expect(updated.length).toBe(1)
    expect(warned).toEqual([])
  })
})
