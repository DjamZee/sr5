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

const item = (type, effects, id, name = id) => ({
  _id: id, name, type, system: {
    systemEffects: effects.map(([category, value]) => ({
      category, value
    }))
  }, toObject: () => ({
    name
  })
})
const power = (key, id = key, name = key) => item("itemPower", [["spiritPower", key]], id, name)

const pack = (collection, documents) => ({
  collection,
  getIndex: vi.fn(async () => documents),
  getDocument: vi.fn(async id => documents.find(d => d._id === id)),
})

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
    const loaded = megapack.getDocument.mock.calls.map(([id]) => id)
    expect(loaded).not.toContain("mp4")
    expect(compendiums.getDocument.mock.calls.map(([id]) => id)).toEqual(["c-astralForm"])
  })

  it("items are read through the index, and an item without a key is not loaded", async () => {
    await watcherPowers()
    expect(megapack.getIndex).toHaveBeenCalledWith({
      fields: ["type", "system.systemEffects"]
    })
    expect(megapack.getDocument.mock.calls.map(([id]) => id)).not.toContain("mp5")
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
})
