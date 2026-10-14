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

// Lot 17b (présentation de DjamZ du 08/10, reproduit sur le 30010) : DialogV2.wait répond au clic sur « Lancer » AVANT
// de fermer sa fenêtre ; la seconde fenêtre de la file, rendue sous le même id pendant ce temps, ne s'ouvrait jamais
// et ne répondait jamais : tous les jets suivants du client restaient bloqués, sans message, jusqu'au rechargement.
describe("lot 17b : la file des fenêtres de jet ne se bloque plus", () => {
  it("la seconde attend que la première ait quitté le registre de Foundry", async () => {
    const instances = new Map()
    foundry.applications.instances = instances
    const first = SR5_RollTest.generateRollDialog(dialogData())
    const second = SR5_RollTest.generateRollDialog(dialogData())
    await tick()
    await tick()
    expect(foundry.applications.api.DialogV2.wait).toHaveBeenCalledTimes(1)
    // La première fenêtre est à l'écran
    instances.set("jet", {})
    // Clic sur « Lancer » : la promesse répond, la fenêtre est encore là
    waits[0](null)
    await first
    await new Promise(r => setTimeout(r, 120))
    expect(foundry.applications.api.DialogV2.wait).toHaveBeenCalledTimes(1)
    // La fenêtre fermée, la seconde s'ouvre
    instances.delete("jet")
    await new Promise(r => setTimeout(r, 120))
    expect(foundry.applications.api.DialogV2.wait).toHaveBeenCalledTimes(2)
    waits[1](null)
    await second
  })

  it("rollWindowClosed répond tout de suite sans fenêtre, et au plus tard après max", async () => {
    foundry.applications.instances = new Map()
    await SR5_RollTest.rollWindowClosed()
    foundry.applications.instances = new Map([["jet", {}]])
    const started = Date.now()
    await SR5_RollTest.rollWindowClosed({
      step: 10, max: 60
    })
    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
  })

  it("un tour resté en attente sans fenêtre à l'écran ne retient pas les jets suivants", async () => {
    foundry.applications.instances = new Map()
    const never = new Promise(() => {})
    const started = Date.now()
    await SR5_RollTest.queueSettled(never, {
      step: 10, quiet: 60
    })
    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
  })

  it("un tour dont la fenêtre est ouverte garde la file", async () => {
    foundry.applications.instances = new Map([["jet", {}]])
    let release
    const pending = new Promise(r => release = r)
    let passed = false
    const waiting = SR5_RollTest.queueSettled(pending, {
      step: 10, quiet: 30
    }).then(() => passed = true)
    await new Promise(r => setTimeout(r, 100))
    expect(passed).toBe(false)
    release()
    await waiting
    expect(passed).toBe(true)
  })
})
