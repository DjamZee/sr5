import {
  describe, it, expect, vi
} from "vitest"

// Effects are created with their rules text in system.gameEffect (anticoagulant, matrix actions, called shots...; not the electricity effect),
// but the itemEffect schema had no such field: Foundry dropped the text on every write.

// Recording stand-ins for Foundry's data fields: a field remembers its class name and options
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
  sr5ItemEffectDataModel
} from "../modules/datamodels/items/itemEffect.js"

describe("an effect keeps its rules text", () => {
  it("the itemEffect schema stores gameEffect as HTML, empty by default", () => {
    const schema = sr5ItemEffectDataModel.defineSchema()
    expect(schema.gameEffect?.kind).toBe("HTMLField")
    expect(schema.gameEffect.options.initial).toBe("")
  })

  // The effect sheet edits system.description too, which the schema dropped on every save
  it("the itemEffect schema stores the description as HTML, empty by default", () => {
    const schema = sr5ItemEffectDataModel.defineSchema()
    expect(schema.description?.kind).toBe("HTMLField")
    expect(schema.description.options.initial).toBe("")
  })
})
