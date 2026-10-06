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
  // fr_contacts: every contact carries the stale source of the actor it was copied from in the pack
  const STALE = "Actor.DkPBhBFEParSeXws.Item.KCrnQvp5qdi6jcfg"
  const packPawn = doc("Compendium.sr5-compendiums.fr_contacts.Item.DYArczOGDGKuiDZw", "itemContact", "Prêteuse sur gages", negotiation(5))
  const frContacts = {
    documentName: "Item",
    getIndex: async () => new Map([[packPawn.id, {
      _id: packPawn.id, type: "itemContact", name: packPawn.name
    }]]),
    getDocument: async id => (id === packPawn.id ? packPawn : null),
  }

  // Hugo's second review, measured: a contact dropped from fr_contacts on a sheet keeps its pack id
  // and the stale source; it was never offered
  it("finds a contact dropped from a pack on a sheet by its pack id", async () => {
    const dropped = doc(`Actor.pc.Item.${packPawn.id}`, "itemContact", "Prêteuse sur gages", negotiation(0), from(STALE))
    const pc = doc("Actor.pc", "actorPc", "Runner", negotiation(3), {
      items: [dropped]
    })
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [pc], items: [], resolve, itemPacks: [frContacts], applied: {
      }
    })
    expect(found.map(c => [c.uuid, c.value, c.owner, c.source])).toEqual([
      [`Actor.pc.Item.${packPawn.id}`, 5, "Runner", packPawn.uuid]
    ])
  })

  // Measured: a second copy of the same contact on a sheet gets a new id
  it("falls back on a name a single compendium entry carries, never on an ambiguous one", async () => {
    const second = doc("Actor.pc.Item.newId", "itemContact", "Prêteuse sur gages", negotiation(0), from(STALE))
    const pc = doc("Actor.pc", "actorPc", "Runner", negotiation(3), {
      items: [second]
    })
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [pc], items: [], resolve, itemPacks: [frContacts], applied: {
      }
    })
    expect(found.map(c => [c.uuid, c.value, c.source])).toEqual([["Actor.pc.Item.newId", 5, packPawn.uuid]])

    // The same name in another compendium: two entries, nothing offered
    const other = {
      documentName: "Item",
      getIndex: async () => new Map([["other", {
        _id: "other", type: "itemContact", name: "Prêteuse sur gages"
      }]]),
      getDocument: async () => doc("Compendium.x.y.Item.other", "itemContact", "Prêteuse sur gages", negotiation(3)),
    }
    expect(await SR5NegotiationRepair.findCandidates({
      actors: [pc], items: [], resolve, itemPacks: [frContacts, other], applied: {
      }
    })).toEqual([])
  })

  it("does not offer again a sheet already corrected, and keeps offering the others", async () => {
    const face = doc("Actor.face", "actorPc", "Face", negotiation(0), from("Compendium.mp.actors.Actor.face"))
    const dealer = doc("Item.dealer", "itemContact", "Vendeur d'armes", negotiation(0), from("Compendium.sr5.fr_contacts.Item.dealer"))
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [face], items: [dealer], resolve, itemPacks: [], applied: {
        "Actor.face": {
          value: 5, date: "2026-10-06"
        }
      }
    })
    expect(found.map(c => c.uuid)).toEqual(["Item.dealer"])
  })

  it("lists a lost actor, its contact through the actor's source, and a world contact", async () => {
    // The embedded contact carries a stale source, copied inside the pack (Hugo, measured)
    const contact = doc("Actor.face.Item.c1", "itemContact", "Intermédiaire", negotiation(0), from("Compendium.mp.actors.Actor.old.Item.zzz"))
    const face = doc("Actor.face", "actorPc", "Face", negotiation(0), {
      ...from("Compendium.mp.actors.Actor.face"), items: [contact]
    })
    const dealer = doc("Item.dealer", "itemContact", "Vendeur d'armes", negotiation(0), from("Compendium.sr5.fr_contacts.Item.dealer"))
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [face], items: [dealer], resolve, itemPacks: [], applied: {
      }
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
      actors: [malley, typed, copy, wrongType], items: [gone], resolve, itemPacks: [frContacts], applied: {
      }
    })
    expect(found).toEqual([])
  })

  it("does not take a twin of another name in the actor's source", async () => {
    const renamed = doc("Actor.face.Item.c1", "itemContact", "Autre", negotiation(0))
    const face = doc("Actor.face", "actorPc", "Face", negotiation(5), {
      ...from("Compendium.mp.actors.Actor.face"), items: [renamed]
    })
    expect(await SR5NegotiationRepair.findCandidates({
      actors: [face], items: [], resolve, itemPacks: [frContacts], applied: {
      }
    })).toEqual([])
  })
})
