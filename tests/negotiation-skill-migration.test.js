import {
  describe, it, expect
} from "vitest"
import {
  migrateNegotiationSkill
} from "../modules/datamodels/common/negotiationMigration.js"

const {
  SR5ShopAvailability
} = await import("../modules/interface/shop-availability.js")

const skill = (base, extra = {
}) => ({
  rating: {
    value: 0, base, modifiers: []
  }, ...extra
})

// The arms dealer of the compendium fr_contacts, as it is stored: Run Faster p. 189,
// Influence 4, Charisma 4, Negotiation 5 under the former key
const armsDealer = () => ({
  name: "Vendeur d'armes",
  system: {
    connection: 4,
    type: "Vendeur d'armes",
    metatype: "human",
    attributes: {
      charisma: {
        natural: {
          value: 0, base: 4, modifiers: []
        }
      }
    },
    skills: {
      perception: skill(4),
      negociation: skill(5),
    },
  },
})

describe("The Negotiation skill under its former key negociation", () => {
  it("moves it to negotiation and drops the former key", () => {
    const source = armsDealer()
    migrateNegotiationSkill(source.system)
    expect(source.system.skills.negotiation).toEqual(skill(5))
    expect("negociation" in source.system.skills).toBe(false)
    expect(source.system.skills.perception).toEqual(skill(4))
  })

  it("keeps what was typed under the current key", () => {
    const system = {
      skills: {
        negotiation: skill(3), negociation: skill(5)
      }
    }
    migrateNegotiationSkill(system)
    expect(system.skills.negotiation).toEqual(skill(3))
    expect("negociation" in system.skills).toBe(false)
  })

  // Hugo's review, measured: in a pack still under the former key, Negotiation brought back to 0 is
  // written as a diff, {negotiation: {rating: {base: 0}}}, next to the former key. It must stay 0.
  it("keeps a 0 written under the current key next to the former one, which only fills the rest", () => {
    const system = {
      skills: {
        negotiation: {
          rating: {
            base: 0
          }
        },
        negociation: skill(5, {
          specializations: "Armes"
        }),
      }
    }
    migrateNegotiationSkill(system)
    expect(system.skills.negotiation.rating.base).toBe(0)
    expect(system.skills.negotiation.rating.modifiers).toEqual([])
    expect(system.skills.negotiation.specializations).toBe("Armes")
    expect("negociation" in system.skills).toBe(false)
  })

  it("keeps the former rating when the current key holds something else only", () => {
    const system = {
      skills: {
        negotiation: {
          specializations: "Marchandage"
        }, negociation: skill(5)
      }
    }
    migrateNegotiationSkill(system)
    expect(system.skills.negotiation.rating.base).toBe(5)
    expect(system.skills.negotiation.specializations).toBe("Marchandage")
  })

  it("leaves a source without the former key, or without skills, as it is", () => {
    const current = {
      skills: {
        negotiation: skill(2)
      }
    }
    migrateNegotiationSkill(current)
    expect(current.skills.negotiation).toEqual(skill(2))
    expect(migrateNegotiationSkill({
    })).toEqual({
    })
    expect(migrateNegotiationSkill(undefined)).toBeUndefined()
  })

  it("gives back the arms dealer his pool as the vendor's searcher: Charisma 4 + Negotiation 5", () => {
    const lost = armsDealer()
    // What the data model left before the fix: the former key dropped, Negotiation 0, defaulting
    delete lost.system.skills.negociation
    expect(SR5ShopAvailability.contactPool(lost).pool).toBe(3)

    const source = armsDealer()
    migrateNegotiationSkill(source.system)
    const searcher = SR5ShopAvailability.contactPool(source)
    expect(searcher.defaulting).toBe(false)
    expect(searcher.negotiation).toBe(5)
    // "Vendeur d'armes" is not among the dealer keywords of the setting: no specialization, 9 dice
    expect(searcher.specialized).toBe(false)
    expect(searcher.pool).toBe(9)
  })

  it("counts the Influence group of a contact as its Negotiation (SR5 p. 90): the cyber technician of Run Faster p. 189", () => {
    const technician = {
      name: "Technicienne cybernétique",
      system: {
        connection: 4, type: "Technicienne cybernétique", metatype: "troll",
        attributes: {
          charisma: {
            natural: {
              value: 0, base: 4, modifiers: []
            }
          }
        },
        skillGroups: {
          influenceGroup: {
            value: 0, base: 4, modifiers: []
          }
        },
        skills: {
          negotiation: skill(0)
        },
      },
    }
    const searcher = SR5ShopAvailability.contactPool(technician)
    expect(searcher.defaulting).toBe(false)
    expect(searcher.negotiation).toBe(4)
    expect(searcher.pool).toBe(8)
  })
})
