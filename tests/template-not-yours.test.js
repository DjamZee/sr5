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

let warned, deleted, updated, rolls, formulas

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
  formulas = []
  globalThis.ui = {
    notifications: {
      warn: (m) => warned.push(m), info: () => {}
    }
  }
  globalThis.Roll = class {
    constructor(formula){
      rolls++
      formulas.push(formula)
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

  it("scatter tells the card whether it happened", async () => {
    sceneWith([template("gm", false)])
    expect(await SR5_CombatHelpers.rollScatter(card)).toBe(false)
    sceneWith([])
    expect(await SR5_CombatHelpers.rollScatter(card)).toBe(false)
    sceneWith([template("gm", true)])
    // The distance scattered, in meters: 2D6 (rolled 7 here) minus 0 hits
    expect(await SR5_CombatHelpers.rollScatter(card)).toBe(7)
  })

  // SR5 p. 285: an indirect area spell under its threshold scatters like a grenade, 2D6 m minus its hits, and
  // moves the template its own card placed, never that of another cast
  it("an area spell scatters its own card's template by 2D6 minus its hits", async () => {
    const spellTemplate = (id, messageId) => ({
      ...template(id, true), flags: {
        sr5: {
          item: "fireball", itemUuid: "Actor.a.Item.fireball", messageId
        }
      }
    })
    const own = spellTemplate("own", "m-spell")
    sceneWith([spellTemplate("other", "m-other"), own])
    game.scenes = [canvas.scene]
    // Not enumerable, like a document's parent, so that duplicating the template does not walk back up to it
    for (const t of canvas.scene.templates) Object.defineProperty(t, "parent", {
      value: canvas.scene
    })
    const spellCard = {
      ...card, test: {
        type: "preparation"
      }, roll: {
        hits: 2
      }, owner: {
        actorId: "a", itemId: "fireball", itemUuid: "Actor.a.Item.fireball", messageId: "m-spell"
      }
    }
    // The Roll here always totals 7: what matters is the formula it was given, and which template moved
    expect(await SR5_CombatHelpers.rollScatter(spellCard)).toBe(7)
    expect(formulas).toEqual(["2d6", "2d6 - 2"])
    expect(updated.length).toBe(1)
    expect(warned).toEqual([])
  })

  // A refused scatter used to spend the card's button anyway, for everyone, the GM included
  it("a refused scatter leaves the card's button, an applied one spends it", async () => {
    const spent = vi.spyOn(SR5_RollMessage, "updateChatButtonHelper").mockImplementation(async () => {})
    globalThis.ChatMessage = {
      getSpeaker: () => ({
      })
    }
    game.messages = {
      get: () => ({
        flags: {
          sr5data: structuredClone({
            ...card, test: {
              typeSub: "grenade"
            }, target: {
            }, previousMessage: {
            }
          })
        }
      })
    }
    const click = () => SR5_RollMessage.chatButtonAction({
      preventDefault(){},
      currentTarget: {
        dataset: {
          action: "nonOpposedTest", type: "scatter"
        },
        closest: () => ({
          dataset: {
            messageId: "m1"
          }
        }),
      },
    })
    sceneWith([template("gm", false)])
    await click()
    expect(spent).not.toHaveBeenCalled()
    sceneWith([template("gm", true)])
    await click()
    expect(spent).toHaveBeenCalledWith("m1", "scatter", 7)
    spent.mockRestore()
  })

  it("remove warns and deletes nothing", async () => {
    sceneWith([template("gm", false)])
    await SR5_RollMessage.removeTemplate(null, "Actor.a.Item.grenade", "gm")
    expect(deleted).toEqual([])
    expect(warned).toEqual(["SR5.WARN_TemplateNotYours"])
  })
})
