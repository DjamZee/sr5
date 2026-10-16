import {
  describe, it, expect
} from "vitest"
import {
  negotiationLooksLost, sourceNegotiation, compendiumSourceOf
} from "../modules/interface/negotiation-repair-rules.js"
import {
  SR5NegotiationRepair, parseCompendiumUuid
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

  // Barthélemy, measured: the Megapack carries the contacts of fr_contacts with the same ids and names. With
  // both modules, the Megapack answers (arbitrage de DjamZ, séance H, H18), whatever the order of the packs
  it("prefers the Megapack's twin to sr5-compendiums', by id and by name", async () => {
    const coder = (uuid, value) => doc(uuid, "itemContact", "Codeuse folle boutonneuse", negotiation(value))
    const frCoder = coder("Compendium.sr5-compendiums.fr_contacts.Item.coder", 0)
    const mpCoder = coder("Compendium.megapack-sr5-foundry-vtt.sr5-megapack-items.Item.coder", 2)
    const packOf = (packageName, d) => ({
      documentName: "Item", metadata: {
        packageName
      },
      getIndex: async () => new Map([["coder", {
        _id: "coder", type: "itemContact", name: d.name
      }]]),
      getDocument: async id => (id === "coder" ? d : null),
    })
    const itemPacks = [packOf("sr5-compendiums", frCoder), packOf("megapack-sr5-foundry-vtt", mpCoder)]
    const dropped = doc("Actor.pc.Item.coder", "itemContact", "Codeuse folle boutonneuse", negotiation(0), from(STALE))
    const second = doc("Actor.pc.Item.newId", "itemContact", "Codeuse folle boutonneuse", negotiation(0), from(STALE))
    const pc = doc("Actor.pc", "actorPc", "Runner", negotiation(3), {
      items: [dropped, second]
    })
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [pc], items: [], resolve, itemPacks, applied: {
      }
    })
    expect(found.map(c => [c.uuid, c.value, c.source])).toEqual([
      ["Actor.pc.Item.coder", 2, mpCoder.uuid],
      ["Actor.pc.Item.newId", 2, mpCoder.uuid],
    ])
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

describe("The repair on a large world (Romuald, ~400 actors: nothing after 5 minutes)", () => {
  it("cuts a compendium uuid, with or without its type and an embedded document", () => {
    expect(parseCompendiumUuid("Compendium.mp.actors.Actor.face")).toEqual({
      collection: "mp.actors", id: "face", embedded: null
    })
    expect(parseCompendiumUuid("Compendium.mp.actors.Actor.face.Item.c1")).toEqual({
      collection: "mp.actors", id: "face", embedded: ["Item", "c1"]
    })
    expect(parseCompendiumUuid("Compendium.mp.actors.face")).toEqual({
      collection: "mp.actors", id: "face", embedded: null
    })
    expect(parseCompendiumUuid("Actor.face")).toBe(null)
    expect(parseCompendiumUuid("")).toBe(null)
  })

  // The index carries the Negotiation: an actor's source is never loaded alone, and the actors
  // whose contacts are needed are loaded together
  it("reads the sources off the index and loads the owners together", async () => {
    const calls = {
      getDocument: 0, getDocuments: 0, resolve: 0
    }
    const from = uuid => ({
      _stats: {
        compendiumSource: uuid
      }
    })
    const entry = (id, type, name, base) => ({
      _id: id, uuid: `Compendium.mp.actors.Actor.${id}`, type, name, system: negotiation(base)
    })
    const packContact = doc("Compendium.mp.actors.Actor.a1.Item.c1", "itemContact", "Fixer", negotiation(4))
    const packOwner = doc("Compendium.mp.actors.Actor.a1", "actorPc", "Face", negotiation(5), {
      items: collection([packContact])
    })
    const actorPack = {
      collection: "mp.actors", documentName: "Actor", title: "Acteurs",
      getIndex: async () => new Map([
        ["a1", entry("a1", "actorPc", "Face", 5)],
        ["a2", entry("a2", "actorPc", "Garde", 0)],
      ]),
      getDocument: async () => {
        calls.getDocument++
        return null
      },
      getDocuments: async ({
        _id__in: ids
      }) => {
        calls.getDocuments++
        return ids.includes("a1") ? [packOwner] : []
      },
    }
    const packs = new Map([["mp.actors", actorPack]])
    const contact = doc("Actor.w1.Item.c1", "itemContact", "Fixer", negotiation(0), from("Compendium.mp.actors.Actor.old.Item.zzz"))
    const face = doc("Actor.w1", "actorPc", "Face", negotiation(0), {
      ...from("Compendium.mp.actors.Actor.a1"), items: [contact]
    })
    const guard = doc("Actor.w2", "actorPc", "Garde", negotiation(0), from("Compendium.mp.actors.Actor.a2"))
    const progress = []
    const found = await SR5NegotiationRepair.findCandidates({
      actors: [face, guard], items: [], itemPacks: [], packs, applied: {
      },
      resolve: async () => {
        calls.resolve++
        return null
      },
      onProgress: (done, total) => progress.push([done, total]),
    })
    expect(found.map(c => [c.uuid, c.value, c.source, c.from])).toEqual([
      ["Actor.w1", 5, "Compendium.mp.actors.Actor.a1", "Acteurs"],
      ["Actor.w1.Item.c1", 4, packContact.uuid, ""],
    ])
    expect(calls.getDocument).toBe(0)
    expect(calls.getDocuments).toBe(1)
    expect(progress.at(-1)).toEqual([3, 3])
  })
})
