import {
  describe, it, expect
} from "vitest"
import {
  negotiationLooksLost, sourceNegotiation, compendiumSourceOf
} from "../modules/interface/negotiation-repair-rules.js"
import {
  SR5NegotiationRepair
} from "../modules/interface/negotiation-repair.js"

// Hugo's review: an actor or a contact imported before the key fix reads 0 for good. Its compendium
// source, migrated on load, gives the Negotiation back; the gamemaster ticks what applies.
const negotiation = (base, specializations = "") => ({
  skills: {
    negotiation: {
      rating: {
        value: 0, base, modifiers: []
      }, specializations
    }
  }
})

const doc = (uuid, type, name, system, extra = {
}) => ({
  uuid, id: uuid.split(".").pop(), type, name, system, items: [], ...extra
})

const collection = list => Object.assign([...list], {
  get: id => list.find(d => d.id === id)
})

describe("Which Negotiation looks lost", () => {
  it("is a 0 with nothing typed; a rating or a specialization is the gamemaster's", () => {
    expect(negotiationLooksLost(negotiation(0))).toBe(true)
    expect(negotiationLooksLost(negotiation(3))).toBe(false)
    expect(negotiationLooksLost(negotiation(0, "Marchandage"))).toBe(false)
    expect(negotiationLooksLost(negotiation(0, ["Marchandage"]))).toBe(false)
    expect(negotiationLooksLost({
    })).toBe(false)
  })

  it("reads the source's rating and only a compendium as a source", () => {
    expect(sourceNegotiation(negotiation(5))).toBe(5)
    expect(sourceNegotiation({
    })).toBe(0)
    expect(compendiumSourceOf({
      _stats: {
        compendiumSource: "Compendium.mp.actors.Actor.face"
      }
    })).toBe("Compendium.mp.actors.Actor.face")
    expect(compendiumSourceOf({
      flags: {
        core: {
          sourceId: "Compendium.old.Item.x"
        }
      }
    })).toBe("Compendium.old.Item.x")
    expect(compendiumSourceOf({
      _stats: {
        compendiumSource: "Actor.world1"
      }
    })).toBe("")
  })
})

describe("The candidates of the repair window", () => {
  // The Megapack, as fromUuid gives it after migrateData: Face 5, its contact 4
  const packContact = doc("Compendium.mp.actors.Actor.face.Item.c1", "itemContact", "Intermédiaire", negotiation(4))
  const packFace = doc("Compendium.mp.actors.Actor.face", "actorPc", "Face", negotiation(5), {
    items: collection([packContact])
  })
  const packDealer = doc("Compendium.sr5.fr_contacts.Item.dealer", "itemContact", "Vendeur d'armes", negotiation(5))
  const packMalley = doc("Compendium.mp.actors.Actor.malley", "actorPc", "Patrick Malley", negotiation(0))
  const sources = new Map([packFace, packContact, packDealer, packMalley].map(d => [d.uuid, d]))
  const resolve = async uuid => {
    if (uuid === "Compendium.gone.Item.x") throw new Error("pack removed")
    return sources.get(uuid) ?? null
  }
  const from = uuid => ({
    _stats: {
      compendiumSource: uuid
    }
  })

  it("lists a lost actor, its contact through the actor's source, and a world contact", async () => {
    // The embedded contact carries a stale source, copied inside the pack (Hugo, measured)
    const contact = doc("Actor.face.Item.c1", "itemContact", "Intermédiaire", negotiation(0), from("Compendium.mp.actors.Actor.old.Item.zzz"))
    const face = doc("Actor.face", "actorPc", "Face", negotiation(0), {
      ...from("Compendium.mp.actors.Actor.face"), items: [contact]
    })
    const dealer = doc("Item.dealer", "itemContact", "Vendeur d'armes", negotiation(0), from("Compendium.sr5.fr_contacts.Item.dealer"))
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [face], items: [dealer], resolve
    })
    expect(found.map(c => [c.uuid, c.value, c.owner])).toEqual([
      ["Actor.face", 5, ""],
      ["Actor.face.Item.c1", 4, "Face"],
      ["Item.dealer", 5, ""],
    ])
  })

  it("leaves out a 0 the source keeps, a typed rating, a world copy, a pack gone, and another type", async () => {
    const malley = doc("Actor.malley", "actorPc", "Patrick Malley", negotiation(0), from("Compendium.mp.actors.Actor.malley"))
    const typed = doc("Actor.face2", "actorPc", "Face", negotiation(2), from("Compendium.mp.actors.Actor.face"))
    const copy = doc("Actor.copy", "actorPc", "Face", negotiation(0), from("Actor.face"))
    const gone = doc("Item.gone", "itemContact", "Ancien", negotiation(0), from("Compendium.gone.Item.x"))
    const wrongType = doc("Actor.grunt", "actorGrunt", "Face", negotiation(0), from("Compendium.mp.actors.Actor.face"))
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [malley, typed, copy, wrongType], items: [gone], resolve
    })
    expect(found).toEqual([])
  })

  it("does not take a twin of another name in the actor's source", async () => {
    const renamed = doc("Actor.face.Item.c1", "itemContact", "Autre", negotiation(0))
    const face = doc("Actor.face", "actorPc", "Face", negotiation(5), {
      ...from("Compendium.mp.actors.Actor.face"), items: [renamed]
    })
    expect(await SR5NegotiationRepair.findCandidates({
      actors: [face], items: [], resolve
    })).toEqual([])
  })
})
