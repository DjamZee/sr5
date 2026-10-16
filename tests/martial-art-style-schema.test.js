import {
  describe, it, expect, vi
} from "vitest"

// The style of a martial art technique (system.type, a key of SR5.martialArtsTypes): without a field in the schema,
// the item sheet's "Style" menu was never saved and the actor sheet's column stayed empty.
vi.hoisted(() => {
  globalThis.foundry ??= {
  }
  globalThis.foundry.abstract ??= {
  }
  globalThis.foundry.abstract.TypeDataModel ??= class {}
  globalThis.foundry.data = {
    fields: new Proxy({
    }, {
      get: (target, name) => class {
        constructor(options) {
          this.kind = name
          this.options = options
        }
      }
    })
  }
})

import {
  sr5ItemMartialArtDataModel
} from "../modules/datamodels/items/itemMartialArt.js"

describe("Martial art technique schema", () => {
  it("keeps its style, empty by default, with no strict choices", () => {
    const schema = sr5ItemMartialArtDataModel.defineSchema()
    expect(schema.type?.kind).toBe("StringField")
    expect(schema.type.options.initial).toBe("")
    expect(schema.type.options.blank).toBe(true)
    expect(schema.type.options.choices).toBeUndefined()
  })
})
