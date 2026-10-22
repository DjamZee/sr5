import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  MEGAPACK_FULL_ID, MEGAPACK_LITE_ID, MEGAPACK_SYSTEM_ID, MEGAPACK_PACKS, activeMegapackId, inActiveMegapack,
  isMegapackCollection, isMegapackPack, systemShipsMegapack, withoutSystemMegapack, megapackUuidRedirects,
  installSystemMegapack, litePathUpdate, megapackRoot, shadowedMegapackIds
} from "../modules/system/megapack.js"
import {
  megapackBannerFolder
} from "../modules/interface/shop-vendor-templates.js"
import {
  SR5_CompendiumUtility
} from "../modules/entities/actors/utilityCompendium.js"

// The Lite inside the system (arbitrage de DjamZ, 23/10, for the 1.0): the system ships the Lite's four packs under the
// same names; a Megapack module, when active, wins and the system's packs are taken out (no item twice).

const modulesOf = (...active) => new Map([MEGAPACK_FULL_ID, MEGAPACK_LITE_ID].map(id => [id, {
  active: active.includes(id)
}]))
const meta = (packageName, name, type = "Item") => ({
  id: `${packageName}.${name}`, name, packageName, type
})
const systemPacks = () => [meta("sr5", "manuel", "JournalEntry"), ...MEGAPACK_PACKS.map(n => meta("sr5", n))]

describe("the system's own edition of the Megapack", () => {
  it("is read when no Megapack module is active and the system ships its packs", () => {
    expect(activeMegapackId(modulesOf(), true)).toBe(MEGAPACK_SYSTEM_ID)
    expect(activeMegapackId(modulesOf(), false)).toBe(null)
  })

  it("gives way to the full module, then to the Lite module (transition)", () => {
    expect(activeMegapackId(modulesOf(MEGAPACK_FULL_ID), true)).toBe(MEGAPACK_FULL_ID)
    expect(activeMegapackId(modulesOf(MEGAPACK_LITE_ID), true)).toBe(MEGAPACK_LITE_ID)
  })

  it("knows from the packs metadata during init, and from game.packs afterwards", () => {
    expect(systemShipsMegapack({
      data: {
        packs: systemPacks() 
      } 
    })).toBe(true)
    expect(systemShipsMegapack({
      data: {
        packs: [meta("sr5", "manuel", "JournalEntry")] 
      } 
    })).toBe(false)
    expect(systemShipsMegapack({
      packs: new Map([["sr5.sr5-megapack-items", {
      }]]), data: {
        packs: [] 
      } 
    })).toBe(true)
    expect(systemShipsMegapack(undefined)).toBe(false)
  })

  it("its packs are Megapack packs, the system's manual is not", () => {
    expect(isMegapackCollection("sr5.sr5-megapack-actors")).toBe(true)
    expect(isMegapackCollection("sr5.manuel")).toBe(false)
    expect(isMegapackCollection("megapack-sr5-lite.sr5-megapack-items")).toBe(true)
    expect(isMegapackCollection("sr5-compendiums.fr_items")).toBe(false)
    expect(isMegapackPack({
      collection: "sr5.sr5-megapack-items", metadata: {
        packageName: "sr5" 
      } 
    })).toBe(true)
    expect(isMegapackPack({
      collection: "sr5.manuel", metadata: {
        packageName: "sr5" 
      } 
    })).toBe(false)
  })

  it("a compendium chosen in another edition is read in the system's", () => {
    expect(inActiveMegapack("megapack-sr5-lite.sr5-megapack-items", modulesOf(), true)).toBe("sr5.sr5-megapack-items")
    expect(inActiveMegapack("megapack-sr5-foundry-vtt.sr5-megapack-actors", modulesOf(), true)).toBe("sr5.sr5-megapack-actors")
    expect(inActiveMegapack("sr5.sr5-megapack-items", modulesOf(MEGAPACK_FULL_ID), true)).toBe("megapack-sr5-foundry-vtt.sr5-megapack-items")
    expect(inActiveMegapack("sr5.manuel", modulesOf(MEGAPACK_FULL_ID), true)).toBe("sr5.manuel")
  })

  it("is never shadowed: it is taken out instead", () => {
    expect(shadowedMegapackIds(modulesOf())).toEqual([])
    expect(shadowedMegapackIds(modulesOf(MEGAPACK_FULL_ID, MEGAPACK_LITE_ID))).toEqual([MEGAPACK_LITE_ID])
  })

  it("keeps its media under systems/sr5/megapack, banners included", () => {
    expect(megapackRoot(MEGAPACK_SYSTEM_ID)).toBe("systems/sr5/megapack")
    expect(megapackBannerFolder(MEGAPACK_SYSTEM_ID)).toBe("systems/sr5/megapack/assets/banners-shop")
    expect(megapackBannerFolder(MEGAPACK_LITE_ID)).toBe("modules/megapack-sr5-lite/assets/banners-shop")
  })
})

describe("the system's packs taken out when a Megapack module is active", () => {
  it("full or Lite module active: the four packs leave, the manual stays", () => {
    for (const active of [MEGAPACK_FULL_ID, MEGAPACK_LITE_ID]) {
      expect(withoutSystemMegapack(systemPacks(), modulesOf(active)).map(p => p.id)).toEqual(["sr5.manuel"])
    }
  })

  it("no module: all stay; a module's own packs of the same names always stay", () => {
    expect(withoutSystemMegapack(systemPacks(), modulesOf())).toHaveLength(5)
    const theirs = MEGAPACK_PACKS.map(n => meta(MEGAPACK_FULL_ID, n))
    expect(withoutSystemMegapack([...systemPacks(), ...theirs], modulesOf(MEGAPACK_FULL_ID)).map(p => p.id))
      .toEqual(["sr5.manuel", ...theirs.map(p => p.id)])
  })
})

describe("the links of every other edition sent to the active one", () => {
  it("system active: the Lite module's and the full module's links go to the system", () => {
    const r = megapackUuidRedirects(modulesOf(), true)
    expect(r["Compendium.megapack-sr5-lite.sr5-megapack-items"]).toBe("Compendium.sr5.sr5-megapack-items")
    expect(r["Compendium.megapack-sr5-foundry-vtt.sr5-megapack-tables"]).toBe("Compendium.sr5.sr5-megapack-tables")
    expect(r["Compendium.sr5.sr5-megapack-items"]).toBeUndefined()
    expect(Object.keys(r)).toHaveLength(8)
  })

  it("full module active: the system's and the Lite's links go to it", () => {
    const r = megapackUuidRedirects(modulesOf(MEGAPACK_FULL_ID), true)
    expect(r["Compendium.sr5.sr5-megapack-actors"]).toBe("Compendium.megapack-sr5-foundry-vtt.sr5-megapack-actors")
    expect(r["Compendium.megapack-sr5-lite.sr5-megapack-items"]).toBe("Compendium.megapack-sr5-foundry-vtt.sr5-megapack-items")
  })

  it("an active module keeps its own links, even when it is not the one read", () => {
    const r = megapackUuidRedirects(modulesOf(MEGAPACK_FULL_ID, MEGAPACK_LITE_ID), true)
    expect(r["Compendium.megapack-sr5-lite.sr5-megapack-items"]).toBeUndefined()
    expect(r["Compendium.sr5.sr5-megapack-items"]).toBe("Compendium.megapack-sr5-foundry-vtt.sr5-megapack-items")
  })

  it("no Megapack at all: no redirect", () => {
    expect(megapackUuidRedirects(modulesOf(), false)).toEqual({
    })
  })
})

describe("installSystemMegapack, at init", () => {
  it("takes the packs out and adds the redirects next to the ones already there", () => {
    const game = {
      modules: modulesOf(MEGAPACK_FULL_ID), data: {
        packs: systemPacks() 
      } 
    }
    const config = {
      compendium: {
        uuidRedirects: {
          "Compendium.other.a": "Compendium.other.b" 
        } 
      } 
    }
    installSystemMegapack(game, config)
    expect(game.data.packs.map(p => p.id)).toEqual(["sr5.manuel"])
    expect(config.compendium.uuidRedirects["Compendium.other.a"]).toBe("Compendium.other.b")
    expect(config.compendium.uuidRedirects["Compendium.sr5.sr5-megapack-items"])
      .toBe("Compendium.megapack-sr5-foundry-vtt.sr5-megapack-items")
  })

  it("system alone: the packs stay and the Lite's links come to them", () => {
    const game = {
      modules: modulesOf(), data: {
        packs: systemPacks() 
      } 
    }
    const config = {
      compendium: {
      } 
    }
    installSystemMegapack(game, config)
    expect(game.data.packs).toHaveLength(5)
    expect(config.compendium.uuidRedirects["Compendium.megapack-sr5-lite.sr5-megapack-actors"])
      .toBe("Compendium.sr5.sr5-megapack-actors")
  })
})

describe("the Lite module's images sent to the system's copy", () => {
  const LITE = "modules/megapack-sr5-lite/Assets-Graphiques-Webp/Visuels/x.webp"
  const SYS = "systems/sr5/megapack/Assets-Graphiques-Webp/Visuels/x.webp"

  it("each string under its dotted key, an array whole", () => {
    const update = litePathUpdate({
      _id: "a", img: LITE, name: "Drone",
      prototypeToken: {
        texture: {
          src: LITE 
        } 
      },
      system: {
        gallery: ["systems/sr5/assets/img/a.svg", LITE], note: "rien" 
      },
    })
    expect(update).toEqual({
      img: SYS, "prototypeToken.texture.src": SYS,
      "system.gallery": ["systems/sr5/assets/img/a.svg", SYS],
    })
  })

  it("leaves the embedded collections named, and a document without such a path, alone", () => {
    expect(litePathUpdate({
      img: "icons/x.svg", items: [{
        img: LITE 
      }] 
    }, ["items"])).toEqual({
    })
    expect(litePathUpdate({
      img: "systems/sr5/assets/img/items/itemGear.svg" 
    })).toEqual({
    })
  })

  it("is idempotent: the system's copy is never touched again", () => {
    expect(litePathUpdate({
      img: SYS 
    })).toEqual({
    })
  })
})

describe("the compendium of base items on auto, with the system's edition", () => {
  let saved
  beforeEach(() => {
    saved = {
      ...globalThis.game 
    }
    globalThis.game.settings = {
      get: (scope, key) => key === "language" ? "fr" : "auto"
    }
    globalThis.game.modules = modulesOf()
    globalThis.game.packs = new Map([["sr5.sr5-megapack-items", {
    }]])
  })
  afterEach(() => {
    globalThis.game = saved
  })

  it("reads the system's items pack first, then sr5-compendiums", () => {
    const ids = SR5_CompendiumUtility.getMainCompendiumIds("creaturePowers")
    expect(ids[0]).toBe("sr5.sr5-megapack-items")
    expect(ids.slice(1).every(id => id.startsWith("sr5-compendiums.fr_"))).toBe(true)
  })

  it("the full module, once active, is read instead", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_FULL_ID)
    expect(SR5_CompendiumUtility.getMainCompendiumIds("creaturePowers")[0]).toBe("megapack-sr5-foundry-vtt.sr5-megapack-items")
  })
})
