import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForPlayer: vi.fn(async () => {}), emitForGM: vi.fn(async () => {}),
  },
}))
const {
  SR5_EffectArea
} = await import("../modules/system/effectArea.js")
const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")
const {
  SR5_SocketHandler
} = await import("../modules/socket.js")

// N70: a resisted area spell asks the token's actor to resist when it enters the template. Until "Apply the
// effect" is clicked the actor has no effect yet, and every move inside the area asked again: one dialog more
// per move, at the player's for a player character. One request per actor, spell and cast while it waits.
describe("a resisted area spell asks for resistance once", () => {
  const SPELL = "Actor.mage.Item.spell"
  let actor, scene, token, inside

  beforeEach(() => {
    SR5_EffectArea.PENDING_RESISTANCES?.clear()
    globalThis.game = {
      i18n: {
        localize: k => k
      },
      messages: {
        get: id => (id === "cast1" ? message : undefined),
        find: () => message,
      },
    }
    const message = {
      id: "cast1", flags: {
        sr5data: {
          test: {
            type: "spell"
          }, owner: {
            itemUuid: SPELL
          }
        }
      }
    }
    globalThis.fromUuid = vi.fn(async () => ({
      name: "Boule de feu", actor: {
        name: "Mage"
      }, system: {
        resisted: true, hits: 4
      }
    }))
    actor = {
      uuid: "Actor.victim", items: [], hasPlayerOwner: false, rollTest: vi.fn(),
      deleteEmbeddedDocuments: vi.fn(async () => {}),
    }
    const template = {
      id: "tplA", flags: {
        sr5: {
          itemHasEffect: true, itemUuid: SPELL, messageId: "cast1"
        }
      }
    }
    scene = {
      templates: [template], tokens: []
    }
    token = {
      id: "victim", parent: scene
    }
    inside = true
    vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockImplementation(async () => actor)
    vi.spyOn(SR5_EffectArea, "checkIfTemplateContainsToken").mockImplementation(async () => inside)
    SR5_SocketHandler.emitForPlayer.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  const moves = async n => {
    for (let i = 0; i < n; i++) await SR5_EffectArea.checkIfTokenIsInTemplate(token)
  }

  it("four moves inside the area, the dialog still open: one request for an NPC", async () => {
    await moves(4)
    expect(actor.rollTest).toHaveBeenCalledTimes(1)
  })

  it("four moves inside the area: one request sent to the player", async () => {
    actor.hasPlayerOwner = true
    vi.spyOn(SR5_EntityHelpers, "getUserOwner").mockReturnValue({
      isGM: false, id: "player"
    })
    await moves(4)
    expect(SR5_SocketHandler.emitForPlayer).toHaveBeenCalledTimes(1)
  })

  it("leaving every template then coming back asks again", async () => {
    await moves(2)
    inside = false
    await moves(1)
    inside = true
    await moves(2)
    expect(actor.rollTest).toHaveBeenCalledTimes(2)
  })

  it("once the effect is on, a later entry after leaving asks again", async () => {
    await moves(1)
    actor.items = [{
      id: "fx", type: "itemEffect", system: {
        ownerItem: SPELL, ownerID: "tplA"
      }
    }]
    await moves(1)
    expect(SR5_EffectArea.PENDING_RESISTANCES.size).toBe(0)
  })
})
