import {
  describe, it, expect
} from "vitest"
import {
  migrateNegotiationTargets
} from "../modules/datamodels/common/negotiationMigration.js"

const effect = (target, extra = {
}) => ({
  category: "skills", target, type: "value", value: 2, ...extra
})

describe("Effects on the Negotiation skill, renamed negociation → negotiation", () => {
  it("rewrites the test and the limit of the former key, in a list or in an object", () => {
    const list = {
      customEffects: [effect("system.skills.negociation.test"), effect("system.skills.negociation.limit")]
    }
    migrateNegotiationTargets(list)
    expect(list.customEffects.map(e => e.target)).toEqual(["system.skills.negotiation.test", "system.skills.negotiation.limit"])

    const object = {
      customEffects: {
        0: effect("system.skills.negociation.test", {
          situational: true, when: "si la cible peut vous sentir"
        })
      }
    }
    migrateNegotiationTargets(object)
    expect(object.customEffects[0]).toEqual(effect("system.skills.negotiation.test", {
      situational: true, when: "si la cible peut vous sentir"
    }))
  })

  it("leaves every other target alone, and can run twice", () => {
    const source = {
      customEffects: [effect("system.skills.negotiation.test"), effect("system.skills.con.test"), effect("system.limits.socialLimit")]
    }
    const snapshot = structuredClone(source)
    migrateNegotiationTargets(source)
    migrateNegotiationTargets(source)
    expect(source).toEqual(snapshot)
  })

  it("does nothing on a source without effects (a partial update)", () => {
    expect(migrateNegotiationTargets({
      quantity: 2
    })).toEqual({
      quantity: 2
    })
    expect(migrateNegotiationTargets(undefined)).toBeUndefined()
  })
})
