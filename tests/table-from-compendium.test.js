import {
  describe, it, expect, beforeAll
} from "vitest"

// A compendium drawn as a table: the lines it is turned into, and the
// entries of a folder.

let sr5EntryResults, sr5PackEntries
beforeAll(async () => {
  let n = 0
  foundry.utils.randomID ??= () => `id${++n}`
  ;({
    sr5EntryResults, sr5PackEntries
  } = await import("../modules/interface/table-from-compendium.js"))
})

const entries = ["Ares Predator", "Colt America", "Ruger Super Warhawk"].map((name, i) => ({
  uuid: `Compendium.m.armes.Item.i${i}`, name, img: `w${i}.webp`
}))

describe("a compendium's entries as the lines of a table", () => {
  it("gives each entry one face of the die when nothing is weighed", () => {
    const {
      results, formula
    } = sr5EntryResults(entries)
    expect(formula).toBe("1d3")
    expect(results.map(r => r.range)).toEqual([[1, 1], [2, 2], [3, 3]])
    expect(results.every(r => r.type === "document" && r.documentUuid.startsWith("Compendium."))).toBe(true)
  })

  it("lays weighted ranges end to end, and strikes a weight of zero off", () => {
    const {
      results, formula
    } = sr5EntryResults(entries, [3, 0, 2])
    expect(formula).toBe("1d5")
    expect(results.map(r => [r.name, r.weight, r.range])).toEqual([
      ["Ares Predator", 3, [1, 3]],
      ["Ruger Super Warhawk", 2, [4, 5]]
    ])
  })

  it("reads a weight that is not a whole number down, and a blank one as none", () => {
    const {
      results
    } = sr5EntryResults(entries, ["2.7", "", -1])
    expect(results.map(r => r.weight)).toEqual([2])
  })
})

describe("the entries of a compendium folder", () => {
  it("include the folders inside it, and nothing else", async () => {
    const pack = {
      getIndex: async () => [
        {
          _id: "a", name: "A", folder: "top", uuid: "Compendium.p.Item.a"
        },
        {
          _id: "b", name: "B", folder: "inner", uuid: "Compendium.p.Item.b"
        },
        {
          _id: "c", name: "C", folder: "other", uuid: "Compendium.p.Item.c"
        },
        {
          _id: "d", name: "D", folder: null, uuid: "Compendium.p.Item.d"
        }
      ],
      // The inner folder is listed before its parent: the walk must not depend on order
      folders: [{
        id: "deep", folder: {
          id: "inner"
        }
      }, {
        id: "inner", folder: {
          id: "top"
        }
      }, {
        id: "top", folder: null
      }, {
        id: "other", folder: null
      }]
    }
    expect((await sr5PackEntries(pack, "top")).map(e => e.name)).toEqual(["A", "B"])
    expect((await sr5PackEntries(pack)).map(e => e.name)).toEqual(["A", "B", "C", "D"])
  })
})
