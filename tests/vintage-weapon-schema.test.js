import {
  describe, it, expect, vi
} from "vitest"

// Vintage (Gun H(e)aven 3 p. 3): the sheet greys the wireless icon from system.isVintage, but it reads the items
// through toObject, which keeps only the schema's fields: without one the flag never reached the sheet.
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
  sr5ItemWeaponDataModel
} from "../modules/datamodels/items/itemWeapon.js"

describe("Vintage weapon schema", () => {
  it("keeps isVintage, false by default", () => {
    const schema = sr5ItemWeaponDataModel.defineSchema()
    expect(schema.isVintage?.kind).toBe("BooleanField")
    expect(schema.isVintage.options.initial).toBe(false)
  })
})
