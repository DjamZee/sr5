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

// N78: with compendium.creaturePowers on "auto", only sr5-compendiums was read. It has no Manifestation
// (SR5 p. 317), so a watcher came without it. When the Megapack is active, a power sr5-compendiums lacks is
// taken from its sr5-megapack-items pack; sr5-compendiums keeps the first say.

const power = (key, id = key, name = key) => ({
  _id: id, name, type: "itemPower", system: {
    systemEffects: [{
      category: "spiritPower", value: key
    }]
  }, toObject: () => ({
    name
  })
})

let setting, megapackActive, getDocument
beforeEach(() => {
  SR5_CompendiumUtility._compendiumCache.clear()
  setting = "auto"
  megapackActive = true
  const base = ["astralForm", "sapience", "search"].map(k => power(k))
  const megapack = [power("manifestation", "1RVfQgVifAbR7nC4", "Manifestation"), power("sapience", "mp2", "Sapience (Mégapack)"), {
    _id: "w1", name: "Arme", type: "itemWeapon", system: {
    }
  }]
  getDocument = vi.fn(async id => megapack.find(i => i._id === id))
  globalThis.ui = {
    notifications: {
      warn: () => {}
    }
  }
  globalThis.game.user = {
    isGM: true
  }
  globalThis.game.settings = {
    get: (scope, key) => key === "language" ? "fr" : setting
  }
  globalThis.game.modules = new Map([["megapack-sr5-foundry-vtt", {
    get active() {
      return megapackActive
    }
  }]])
  globalThis.game.packs = new Map([
    ["sr5-compendiums.fr_powers-creatures", {
      getDocuments: async () => base
    }],
    ["megapack-sr5-foundry-vtt.sr5-megapack-items", {
      getIndex: async () => megapack, getDocument
    }],
  ])
})

const watcherPowers = async () => {
  const powers = await SR5_CompendiumUtility.getCategoryItems("creaturePowers")
  const found = await SR5_CompendiumUtility.findBaseSpiritPowersInCompendium([], powers, "watcher")
  return found.map(i => i.name).sort()
}

describe("creature powers on auto with the Megapack", () => {
  it("the watcher gets Manifestation from the Megapack", async () => {
    expect(await watcherPowers()).toEqual(["Manifestation", "astralForm", "sapience", "search"])
  })

  it("sr5-compendiums keeps the first say: a power it has is not doubled", async () => {
    await watcherPowers()
    expect(getDocument).toHaveBeenCalledTimes(1)
    expect(getDocument).toHaveBeenCalledWith("1RVfQgVifAbR7nC4")
  })

  it("an inactive Megapack is not read", async () => {
    megapackActive = false
    expect(await watcherPowers()).toEqual(["astralForm", "sapience", "search"])
  })

  it("a compendium chosen by the GM is the only one read", async () => {
    setting = "sr5-compendiums.fr_powers-creatures"
    expect(await watcherPowers()).toEqual(["astralForm", "sapience", "search"])
  })
})
