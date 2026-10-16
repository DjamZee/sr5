import {
  describe, it, expect, vi
} from "vitest"

// A contact brought to life from its item (createSidekick, itemContact) is an actorGrunt. Its schema had no
// creatorId / creatorItemId, which createSidekick writes and actorSpirit keeps: Foundry dropped them, findSidekick
// never found the contact, and it could not be sent back to its item (Maëlle#3381, 16/10).

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
  class Field {
    constructor(options) {
      this.options = options
    }
  }
  class SchemaField extends Field {
    constructor(fields, options) {
      super(options)
      this.fields = fields
    }
  }
  globalThis.foundry ??= {
  }
  globalThis.foundry.data = {
    fields: new Proxy({
      SchemaField
    }, {
      get: (target, name) => target[name] ?? Field
    })
  }
})

import {
  sr5ActorGruntDataModel
} from "../modules/datamodels/actors/actorGrunt.js"
import {
  sr5ActorSpiritDataModel
} from "../modules/datamodels/actors/actorSpirit.js"
import {
  SR5_ActorHelper
} from "../modules/entities/actors/entityActor-helpers.js"

describe("a contact brought to life", () => {
  const grunt = sr5ActorGruntDataModel.defineSchema()

  it("keeps who created it and from which item, as a spirit does", () => {
    const spirit = sr5ActorSpiritDataModel.defineSchema()
    for (const key of ["creatorId", "creatorItemId"]) {
      expect(grunt[key], key).toBeDefined()
      expect(grunt[key].constructor).toBe(spirit[key].constructor)
      expect(grunt[key].options).toEqual(spirit[key].options)
    }
  })

  it("is found again by its creator and its item, so it can be sent back", () => {
    // What createSidekick writes for an itemContact, as the schema keeps it: only the fields it declares
    const written = {
      creatorId: "pcActor", creatorItemId: "contactItem", unknownField: "dropped"
    }
    const kept = Object.fromEntries(Object.entries(written).filter(([key]) => key in grunt))
    const contact = {
      type: "actorGrunt", system: kept
    }
    const other = {
      type: "actorGrunt", system: {
        creatorId: "", creatorItemId: ""
      }
    }
    expect(SR5_ActorHelper.findSidekick([other, contact], "pcActor", "contactItem")).toBe(contact)
    // Another character's copy of the same item is not this one's contact
    expect(SR5_ActorHelper.findSidekick([other, contact], "copyOfPc", "contactItem")).toBeUndefined()
  })
})
