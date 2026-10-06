import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock("../modules/socket.js", () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_RollTest
} = await import("../modules/rolls/roll-test.js")
const {
  SR5_RollTestHelper
} = await import("../modules/rolls/roll-test-helper.js")
const {
  SR5_EntityHelpers
} = await import("../modules/entities/helpers.js")

// M5 D3 (mesuré par Elsa, 06/10) : un sort de zone résisté par deux acteurs du MJ ouvrait deux fenêtres de jet à
// l'id fixe « jet » : la seconde ne s'ouvrait pas, sa résistance était perdue. La seconde attend désormais la première.

const dialogData = () => ({
  owner: {
    actorId: "a1"
  }, edge: {
  }, test: {
    type: "spellResistance", title: "Résister"
  }, magic: {
  }, dicePool: {
    modifiers: []
  }, limit: {
  }, combat: {
  },
})

let waits
beforeEach(() => {
  waits = []
  globalThis.game.i18n = {
    localize: k => k, format: k => k
  }
  globalThis.foundry = {
    ...(globalThis.foundry ?? {
    }),
    applications: {
      handlebars: {
        renderTemplate: vi.fn(async () => "<div></div>")
      },
      api: {
        DialogV2: {
          wait: vi.fn(() => new Promise(resolve => waits.push(resolve)))
        }
      },
    },
  }
  vi.spyOn(SR5_EntityHelpers, "getRealActorFromID").mockReturnValue({
    system: {
      magic: {
      }
    }
  })
  vi.spyOn(SR5_RollTestHelper, "canUseEdge").mockResolvedValue(false)
  vi.spyOn(SR5_RollTestHelper, "determineEdgeActor").mockResolvedValue(null)
  vi.spyOn(SR5_RollTestHelper, "handleCanceledTest").mockResolvedValue(undefined)
})

const tick = () => new Promise(r => setTimeout(r, 0))

describe("M5 D3 : une fenêtre de jet à la fois", () => {
  it("la seconde s'ouvre quand la première est fermée", async () => {
    const first = SR5_RollTest.generateRollDialog(dialogData())
    const second = SR5_RollTest.generateRollDialog(dialogData())
    await tick()
    expect(foundry.applications.api.DialogV2.wait).toHaveBeenCalledTimes(1)
    waits[0](null)
    await first
    await tick()
    expect(foundry.applications.api.DialogV2.wait).toHaveBeenCalledTimes(2)
    waits[1](null)
    await second
    expect(SR5_RollTestHelper.handleCanceledTest).toHaveBeenCalledTimes(2)
  })
})
