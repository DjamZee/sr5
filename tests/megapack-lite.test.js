import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  MEGAPACK_FULL_ID, MEGAPACK_LITE_ID, activeMegapackId, inActiveMegapack, isMegapackPackage
} from "../modules/system/megapack.js"
import {
  SR5_CompendiumUtility
} from "../modules/entities/actors/utilityCompendium.js"
import {
  SR5NegotiationRepair
} from "../modules/interface/negotiation-repair.js"

// The Megapack ships in two editions with the same pack names (voie A, arbitrage de DjamZ, 16/10): the system
// reads the full one when it is active, else the Lite one, else none.

const modulesOf = (...active) => new Map([MEGAPACK_FULL_ID, MEGAPACK_LITE_ID].map(id => [id, {
  active: active.includes(id)
}]))

describe("the active Megapack", () => {
  it("full alone: the full one", () => {
    expect(activeMegapackId(modulesOf(MEGAPACK_FULL_ID))).toBe(MEGAPACK_FULL_ID)
  })

  it("Lite alone: the Lite one", () => {
    expect(activeMegapackId(modulesOf(MEGAPACK_LITE_ID))).toBe(MEGAPACK_LITE_ID)
  })

  it("both active: the full one wins", () => {
    expect(activeMegapackId(modulesOf(MEGAPACK_LITE_ID, MEGAPACK_FULL_ID))).toBe(MEGAPACK_FULL_ID)
  })

  it("none active, or not installed: none", () => {
    expect(activeMegapackId(modulesOf())).toBe(null)
    expect(activeMegapackId(new Map())).toBe(null)
    expect(activeMegapackId(undefined)).toBe(null)
  })

  it("recognizes both editions as a Megapack package, and nothing else", () => {
    expect(isMegapackPackage(MEGAPACK_FULL_ID)).toBe(true)
    expect(isMegapackPackage(MEGAPACK_LITE_ID)).toBe(true)
    expect(isMegapackPackage("sr5-compendiums")).toBe(false)
    expect(isMegapackPackage(undefined)).toBe(false)
  })
})

describe("the compendium of base items on auto", () => {
  beforeEach(() => {
    globalThis.game.settings = {
      get: (scope, key) => key === "language" ? "fr" : "auto"
    }
  })

  it("full alone: reads the full one's pack, as before", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_FULL_ID)
    expect(SR5_CompendiumUtility.getMainCompendiumIds("creaturePowers")[0]).toBe("megapack-sr5-foundry-vtt.sr5-megapack-items")
  })

  it("Lite alone: reads the Lite one's pack", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_LITE_ID)
    expect(SR5_CompendiumUtility.getMainCompendiumIds("creaturePowers")[0]).toBe("megapack-sr5-lite.sr5-megapack-items")
  })

  it("both active: reads the full one's pack only", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_FULL_ID, MEGAPACK_LITE_ID)
    const ids = SR5_CompendiumUtility.getMainCompendiumIds("creaturePowers")
    expect(ids[0]).toBe("megapack-sr5-foundry-vtt.sr5-megapack-items")
    expect(ids.some(id => id.startsWith(MEGAPACK_LITE_ID))).toBe(false)
  })

  it("none active: the sr5-compendiums packs only, and the warning names the full one", () => {
    globalThis.game.modules = modulesOf()
    expect(SR5_CompendiumUtility.getMainCompendiumIds("creaturePowers").every(id => id.startsWith("sr5-compendiums."))).toBe(true)
    expect(SR5_CompendiumUtility.MEGAPACK.pack).toBe("megapack-sr5-foundry-vtt.sr5-megapack-items")
  })
})

describe("a compendium chosen in the other edition of the Megapack", () => {
  const settingsOf = chosen => ({
    get: (scope, key) => key === "language" ? "fr" : key === "compendium.creaturePowers" ? chosen : "auto"
  })

  it("full chosen, Lite alone active: reads the Lite one's pack of the same name (manual 2.1.3)", () => {
    globalThis.game.settings = settingsOf("megapack-sr5-foundry-vtt.sr5-megapack-items")
    globalThis.game.modules = modulesOf(MEGAPACK_LITE_ID)
    expect(SR5_CompendiumUtility.getMainCompendiumIds("creaturePowers")).toEqual(["megapack-sr5-lite.sr5-megapack-items"])
  })

  it("Lite chosen, full alone active: reads the full one's", () => {
    globalThis.game.settings = settingsOf("megapack-sr5-lite.sr5-megapack-items")
    globalThis.game.modules = modulesOf(MEGAPACK_FULL_ID)
    expect(SR5_CompendiumUtility.getMainCompendiumIds("creaturePowers")).toEqual(["megapack-sr5-foundry-vtt.sr5-megapack-items"])
  })

  it("the chosen edition active, or none active, or another compendium: the choice as it is", () => {
    expect(inActiveMegapack("megapack-sr5-foundry-vtt.sr5-megapack-items", modulesOf(MEGAPACK_FULL_ID, MEGAPACK_LITE_ID)))
      .toBe("megapack-sr5-foundry-vtt.sr5-megapack-items")
    expect(inActiveMegapack("megapack-sr5-foundry-vtt.sr5-megapack-items", modulesOf()))
      .toBe("megapack-sr5-foundry-vtt.sr5-megapack-items")
    expect(inActiveMegapack("world.mes-pouvoirs", modulesOf(MEGAPACK_LITE_ID))).toBe("world.mes-pouvoirs")
  })
})

describe("the Negotiation repair reads the Lite Megapack first too", () => {
  it("prefers the Lite Megapack's contact to sr5-compendiums'", async () => {
    const contact = (uuid, value) => ({
      uuid, documentName: "Item", type: "itemContact", name: "Codeuse folle boutonneuse",
      system: {
        skills: {
          negotiation: {
            rating: {
              base: value
            }
          }
        }
      },
      _stats: {
        compendiumSource: null
      },
    })
    const frCoder = contact("Compendium.sr5-compendiums.fr_contacts.Item.coder", 0)
    const liteCoder = contact("Compendium.megapack-sr5-lite.sr5-megapack-items.Item.coder", 2)
    const packOf = (packageName, d) => ({
      documentName: "Item", metadata: {
        packageName
      },
      getIndex: async () => new Map([["coder", {
        _id: "coder", type: "itemContact", name: d.name
      }]]),
      getDocument: async id => (id === "coder" ? d : null),
    })
    const dropped = contact("Actor.pc.Item.coder", 0)
    dropped._stats.compendiumSource = "Compendium.old.contacts.Item.gone"
    const pc = {
      uuid: "Actor.pc", documentName: "Actor", type: "actorPc", name: "Runner",
      system: {
        skills: {
          negotiation: {
            rating: {
              base: 3
            }
          }
        }
      },
      items: [dropped],
    }
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [pc], items: [], resolve: async () => null,
      itemPacks: [packOf("sr5-compendiums", frCoder), packOf(MEGAPACK_LITE_ID, liteCoder)],
      applied: {
      }
    })
    expect(found.map(c => [c.uuid, c.value, c.source])).toEqual([["Actor.pc.Item.coder", 2, liteCoder.uuid]])
  })
})
