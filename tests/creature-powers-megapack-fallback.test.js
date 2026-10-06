import {
  describe, it, expect, vi, beforeEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_CompendiumUtility
} from "../modules/entities/actors/utilityCompendium.js"

// Le Mégapack seul suffit (arbitrage de DjamZ, séance H, H18): on "auto", the Megapack's sr5-megapack-items is
// read first for every category, and the sr5-compendiums packs only add what it lacks. Items are read through
// the index, and a power key is given once: a power the Megapack holds twice is not doubled.
// History, N78: sr5-compendiums alone had no Manifestation (SR5 p. 317), so a watcher came without it.

const item = (type, effects, id, name = id, source = "") => ({
  _id: id, name, type, system: {
    source,
    systemEffects: effects.map(([category, value]) => ({
      category, value
    }))
  }, toObject: () => ({
    name
  })
})
const power = (key, id = key, name = key, source = "") => item("itemPower", [["spiritPower", key]], id, name, source)

const pack = (collection, documents) => ({
  collection,
  getIndex: vi.fn(async () => documents),
  getDocuments: vi.fn(async ({
    _id__in
  }) => documents.filter(d => _id__in.includes(d._id))),
})
// The ids a pack was asked to load
const loadedIds = p => p.getDocuments.mock.calls.flatMap(([query]) => query._id__in)

let setting, megapackActive, megapack, compendiums, sprites, warn
beforeEach(() => {
  SR5_CompendiumUtility._compendiumCache.clear()
  SR5_CompendiumUtility._warnedMissingCompendiums.clear()
  setting = "auto"
  megapackActive = true
  megapack = pack("megapack-sr5-foundry-vtt.sr5-megapack-items", [
    power("manifestation", "mp1", "Manifestation"),
    power("sapience", "mp2", "Sapience (Mégapack)"),
    power("search", "mp3", "Recherche"),
    power("search", "mp4", "Recherche (doublon)"),
    item("itemPower", [], "mp5", "Pouvoir sans clé"),
    item("itemWeapon", [["baseOwnItem", "actorPc"]], "mp6", "Mains nues"),
    item("itemSpritePower", [["baseOwnItem", "machine"]], "mp7", "Diagnostic"),
    item("itemSpritePower", [["baseOwnItem", "machine"]], "mp8", "Gremlins"),
  ])
  compendiums = pack("sr5-compendiums.fr_powers-creatures", ["astralForm", "sapience", "search"].map(k => power(k, `c-${k}`, `c-${k}`)))
  sprites = pack("sr5-compendiums.fr_powers-sprites", [item("itemSpritePower", [["baseOwnItem", "machine"]], "c-stab", "Stabilité")])
  warn = vi.fn()
  globalThis.ui = {
    notifications: {
      warn
    }
  }
  globalThis.game.user = {
    isGM: true
  }
  globalThis.game.i18n = {
    format: key => key, localize: key => key
  }
  globalThis.game.settings = {
    get: (scope, key) => key === "language" ? "fr" : setting
  }
  globalThis.game.modules = new Map([["megapack-sr5-foundry-vtt", {
    get active() {
      return megapackActive
    }
  }]])
  globalThis.game.packs = new Map([megapack, compendiums, sprites].map(p => [p.collection, p]))
})

const watcherPowers = async () => {
  const powers = await SR5_CompendiumUtility.getCategoryItems("creaturePowers")
  const found = await SR5_CompendiumUtility.findBaseSpiritPowersInCompendium([], powers, "watcher")
  return found.map(i => i.name).sort()
}

describe("base items on auto: the Megapack first, sr5-compendiums as a fallback", () => {
  it("the Megapack gives its powers first, sr5-compendiums only what it lacks", async () => {
    expect(await watcherPowers()).toEqual(["Manifestation", "Recherche", "Sapience (Mégapack)", "c-astralForm"])
  })

  it("a power the Megapack holds twice is given once, and nothing is loaded twice", async () => {
    await watcherPowers()
    const loaded = loadedIds(megapack)
    expect(loaded).not.toContain("mp4")
    expect(loadedIds(compendiums)).toEqual(["c-astralForm"])
  })

  it("items are read through the index, and an item without a key is not loaded", async () => {
    await watcherPowers()
    expect(megapack.getIndex).toHaveBeenCalledWith({
      fields: ["type", "system.systemEffects", "system.source"]
    })
    expect(loadedIds(megapack)).not.toContain("mp5")
  })

  // Measured: one request per item took 26 s for the 85 creature powers of a cold Megapack
  it("the chosen items of a compendium are loaded in one request", async () => {
    await watcherPowers()
    expect(megapack.getDocuments).toHaveBeenCalledTimes(1)
    expect(loadedIds(megapack)).toEqual(["mp1", "mp3", "mp2"])
  })

  it("several items given to the same sub type are all kept (sprite powers)", async () => {
    const powers = await SR5_CompendiumUtility.getCategoryItems("spritePowers")
    expect(powers.map(i => i.name)).toEqual(["Diagnostic", "Gremlins"])
  })

  it("without sr5-compendiums, the Megapack alone is enough and nothing is reported", async () => {
    game.packs.delete(compendiums.collection)
    expect(await watcherPowers()).toEqual(["Manifestation", "Recherche", "Sapience (Mégapack)"])
    expect(warn).not.toHaveBeenCalled()
  })

  it("an inactive Megapack is not read", async () => {
    megapackActive = false
    expect(await watcherPowers()).toEqual(["c-astralForm", "c-sapience", "c-search"])
    expect(megapack.getIndex).not.toHaveBeenCalled()
  })

  it("with neither module, the GM is told once", async () => {
    megapackActive = false
    game.packs.delete(compendiums.collection)
    expect(await watcherPowers()).toEqual([])
    SR5_CompendiumUtility._compendiumCache.clear()
    await watcherPowers()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("a compendium chosen by the GM is the only one read", async () => {
    setting = "sr5-compendiums.fr_powers-creatures"
    expect(await watcherPowers()).toEqual(["c-astralForm", "c-sapience", "c-search"])
    expect(megapack.getIndex).not.toHaveBeenCalled()
  })

  // Cyprien, measured: two items with the same key, the first found by id won. An abomination and an insect
  // soldier got Dard caudal (Howling Shadows p. 188) instead of Arme naturelle (SR5 p. 396)
  it("between two items with the same key, the core rulebook's wins, whatever their ids", async () => {
    megapack = pack("megapack-sr5-foundry-vtt.sr5-megapack-items", [
      power("naturalWeapon", "7iCEmlgKlvcXGeSq", "Dard caudal", "howlingShadows"),
      power("naturalWeapon", "RRPCyfetRGKNUa7Q", "Arme naturelle", "core"),
      power("naturalWeapon", "0aaaaaaaaaaaaaaa", "Aiguillon", "streetGrimoire"),
    ])
    game.packs.set(megapack.collection, megapack)
    const powers = await SR5_CompendiumUtility.getCategoryItems("creaturePowers")
    expect(powers.filter(i => i.system.systemEffects[0]?.value === "naturalWeapon").map(i => i.name)).toEqual(["Arme naturelle"])
  })

  it("without the core rulebook's, the order is by name, then by id: never the order of the index", () => {
    const order = SR5_CompendiumUtility.inKeyOrder([
      power("x", "b2", "Zèbre"), power("x", "a1", "Âne"), power("x", "a0", "Âne"), power("x", "c3", "Base", "core"),
    ]).map(e => e._id)
    expect(order).toEqual(["c3", "a0", "a1", "b2"])
  })
})

describe("the reference compendiums are indexed on ready", () => {
  const gm = active => {
    game.user = {
      id: "gm", isGM: true
    }
    game.users = {
      activeGM: {
        id: active ? "gm" : "other"
      }
    }
  }

  it("by the active GM, with the fields the creation reads", async () => {
    gm(true)
    await SR5_CompendiumUtility.preloadIndexes()
    expect(megapack.getIndex).toHaveBeenCalledWith({
      fields: SR5_CompendiumUtility.INDEX_FIELDS
    })
    expect(compendiums.getIndex).toHaveBeenCalled()
  })

  it("not by another GM, nor by a player", () => {
    gm(false)
    expect(SR5_CompendiumUtility.preloadIndexes()).toBeNull()
    game.user = {
      id: "p", isGM: false
    }
    expect(SR5_CompendiumUtility.preloadIndexes()).toBeNull()
    expect(megapack.getIndex).not.toHaveBeenCalled()
  })
})
