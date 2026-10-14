import {
  describe, it, expect, vi, beforeAll
} from "vitest"
import {
  readFileSync
} from "node:fs"

// Lot 34: opening a compendium read every entry with one getDocument each — one server request per entry,
// each answered by reading the whole pack (about 8 minutes for the Megapack's 5047 objects). The line under
// each entry now comes from one index read with the fields it needs.
describe("compendium info line", () => {
  let SR5CompendiumInfo
  beforeAll(async () => {
    globalThis.game ??= {
    }
    globalThis.game.i18n = {
      localize: k => k
    }
    ;({
      SR5CompendiumInfo
    } = await import("../modules/interface/compendium.js"))
  })

  it("reads the index once and never a document", async () => {
    const index = new Map([
      ["a1", {
        _id: "a1", type: "itemArmor", system: {
          isAccessory: false, armorValue: {
            base: 12
          }
        }
      }],
      ["q1", {
        _id: "q1", type: "itemQuality", system: {
          karmaCost: 7
        }
      }],
    ])
    const pack = {
      metadata: {
        system: "sr5", label: "x", id: "m.x"
      },
      getIndex: vi.fn(async () => index),
      getDocument: vi.fn(),
    }
    const rows = ["a1", "q1"].map(id => {
      const li = {
        dataset: {
          entryId: id
        },
        children: [null, {
          insertAdjacentHTML: vi.fn()
        }]
      }
      return li
    })
    await SR5CompendiumInfo.onRenderCompendium({
      collection: pack
    }, {
      querySelectorAll: () => rows
    })
    expect(pack.getIndex).toHaveBeenCalledTimes(1)
    expect(pack.getDocument).not.toHaveBeenCalled()
    expect(rows[0].children[1].insertAdjacentHTML.mock.calls[0][1]).toContain("12")
    expect(rows[1].children[1].insertAdjacentHTML.mock.calls[0][1]).toContain("7")
  })

  it("spirit types come in one request per pack", () => {
    const src = readFileSync("modules/entities/items/spirit-types.js", "utf8")
    expect(src).not.toMatch(/pack\.getDocument\(/)
    expect(src).toMatch(/pack\.getDocuments\(\{\s*type: "itemSpiritType"/)
  })
})
