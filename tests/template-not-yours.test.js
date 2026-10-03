import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
  },
}))

const {
  SR5_RollMessage
} = await import("../modules/rolls/roll-message.js")
const {
  SR5_CombatHelpers
} = await import("../modules/rolls/roll-helpers/combat.js")

// A template belongs to whoever placed it, and to the GM. A player clicking "Scatter" or "Remove template" on
// someone else's card used to roll the dice, announce a distance, and then be refused by Foundry with a raw
// permission error. Both buttons now warn first, and the scatter rolls nothing.

let warned, deleted, updated, rolls

function template(id, owned){
  return {
    id, x: 0, y: 0,
    flags: {
      sr5: {
        item: "grenade", itemUuid: "Actor.a.Item.grenade"
      }
    },
    canUserModify: () => owned,
    update: async (data) => updated.push(data),
  }
}

function sceneWith(list){
  const templates = [...list]
  templates.get = (id) => list.find(t => t.id === id)
  globalThis.canvas = {
    scene: {
      templates,
      tokens: [],
      deleteEmbeddedDocuments: async (type, ids) => {
        deleted.push(...ids)
      },
    },
    grid: {
      getTranslatedPoint: (o) => o
    },
  }
}

beforeEach(() => {
  warned = []
  deleted = []
  updated = []
  rolls = 0
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

const card = {
  owner: {
    actorId: "a", itemId: "grenade"
  },
  roll: {
    hits: 0
  },
  combat: {
    grenade: {
      templateId: "gm"
    },
    ammo: {
      effects: {
      }
    }
  },
}

describe("someone else's template", () => {
  it("scatter warns and rolls no die", async () => {
    sceneWith([template("gm", false)])
    await SR5_CombatHelpers.rollScatter(card)
    expect(rolls).toBe(0)
    expect(updated).toEqual([])
    expect(warned).toEqual(["SR5.WARN_TemplateNotYours"])
  })

  it("scatter of one's own template still rolls and moves it", async () => {
    sceneWith([template("gm", true)])
    await SR5_CombatHelpers.rollScatter(card)
    expect(rolls).toBe(2)
    expect(updated.length).toBe(1)
    expect(warned).toEqual([])
  })

  it("remove warns and deletes nothing", async () => {
    sceneWith([template("gm", false)])
    await SR5_RollMessage.removeTemplate(null, "Actor.a.Item.grenade", "gm")
    expect(deleted).toEqual([])
    expect(warned).toEqual(["SR5.WARN_TemplateNotYours"])
  })
})
