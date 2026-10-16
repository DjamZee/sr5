import {
  describe, it, expect, vi, beforeEach, afterEach
} from "vitest"

// Both Megapacks active (the full one and the Lite one, same packs, same _id): the system reads the full one, and
// every list of all the packs showed each item twice (Maëlle#3381, 16/10: 5 776 shop rows for 2 888 items, 296 models
// at the dealership for 148). The packs of the Megapack not read are left out, the GM's shelves kept.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  MEGAPACK_FULL_ID, MEGAPACK_LITE_ID, shadowedMegapackIds, isShadowedMegapackPack, withoutShadowedMegapack
} from "../modules/system/megapack.js"
import {
  SR5ShopStock
} from "../modules/interface/shop-stock.js"

const modulesOf = (...active) => new Map([MEGAPACK_FULL_ID, MEGAPACK_LITE_ID].map(id => [id, {
  active: active.includes(id)
}]))

const FULL_GEAR = `${MEGAPACK_FULL_ID}.sr5-megapack-items`
const LITE_GEAR = `${MEGAPACK_LITE_ID}.sr5-megapack-items`
const OTHER = "sr5-compendiums.weapons-fr"
const pack = collection => ({
  collection, documentName: "Item", metadata: {
    packageName: collection.split(".")[0]
  }
})
const packs = [pack(FULL_GEAR), pack(LITE_GEAR), pack(OTHER)]
const ids = list => list.map(p => p.collection)

describe("the shadowed Megapack", () => {
  it("full alone: nothing is shadowed, every pack is read", () => {
    expect(shadowedMegapackIds(modulesOf(MEGAPACK_FULL_ID))).toEqual([])
    expect(ids(withoutShadowedMegapack(packs, modulesOf(MEGAPACK_FULL_ID)))).toEqual([FULL_GEAR, LITE_GEAR, OTHER])
  })

  it("Lite alone: nothing is shadowed, the Lite packs are read", () => {
    expect(shadowedMegapackIds(modulesOf(MEGAPACK_LITE_ID))).toEqual([])
    expect(isShadowedMegapackPack(pack(LITE_GEAR), modulesOf(MEGAPACK_LITE_ID))).toBe(false)
  })

  it("both: the Lite one is shadowed, its packs are left out once", () => {
    const both = modulesOf(MEGAPACK_FULL_ID, MEGAPACK_LITE_ID)
    expect(shadowedMegapackIds(both)).toEqual([MEGAPACK_LITE_ID])
    expect(ids(withoutShadowedMegapack(packs, both))).toEqual([FULL_GEAR, OTHER])
    // A pack or its collection id
    expect(isShadowedMegapackPack(LITE_GEAR, both)).toBe(true)
    expect(isShadowedMegapackPack(FULL_GEAR, both)).toBe(false)
    expect(isShadowedMegapackPack(pack(OTHER), both)).toBe(false)
  })

  it("no Megapack, no modules: nothing left out", () => {
    expect(ids(withoutShadowedMegapack(packs, modulesOf()))).toEqual([FULL_GEAR, LITE_GEAR, OTHER])
    expect(ids(withoutShadowedMegapack(packs, undefined))).toEqual([FULL_GEAR, LITE_GEAR, OTHER])
    expect(withoutShadowedMegapack(undefined, undefined)).toEqual([])
  })
})

describe("the shop's shelves with both Megapacks", () => {
  const saved = {
  }
  let settings
  beforeEach(() => {
    saved.modules = globalThis.game.modules
    saved.get = globalThis.game.settings.get
    settings = {
      sr5ShopExcludedPacks: [], sr5ShopIncludedPacks: []
    }
    globalThis.game.settings.get = (scope, key) => settings[key]
  })
  afterEach(() => {
    globalThis.game.modules = saved.modules
    globalThis.game.settings.get = saved.get
  })

  const entry = packId => ({
    docName: "Item", type: "itemWeapon", packId, system: {
      price: {
        value: 650
      }
    }, flags: {
    }
  })
  // The 2 888 items of one Megapack, as the shop's index lists them for each pack read
  const sellable = list => list.filter(packId => SR5ShopStock.canSell(entry(packId)))

  it("full alone: its packs are shelves", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_FULL_ID)
    expect(sellable([FULL_GEAR, OTHER])).toEqual([FULL_GEAR, OTHER])
  })

  it("Lite alone: its packs are shelves, an exclusion of the GM still holds", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_LITE_ID)
    expect(sellable([LITE_GEAR, OTHER])).toEqual([LITE_GEAR, OTHER])
    settings.sr5ShopExcludedPacks = [LITE_GEAR]
    expect(sellable([LITE_GEAR, OTHER])).toEqual([OTHER])
  })

  it("both: the Lite packs are off the shelves, so each item is sold once", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_FULL_ID, MEGAPACK_LITE_ID)
    expect(sellable([FULL_GEAR, LITE_GEAR, OTHER])).toEqual([FULL_GEAR, OTHER])
    // The GM's Equip mode opens every shelf, but not the double
    expect(SR5ShopStock.canSell(entry(LITE_GEAR), {
      equip: true
    })).toBe(false)
    expect(SR5ShopStock.canSell(entry(FULL_GEAR), {
      equip: true
    })).toBe(true)
  })

  it("both: a Lite pack the GM ticked is on the shelves again", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_FULL_ID, MEGAPACK_LITE_ID)
    settings.sr5ShopIncludedPacks = [LITE_GEAR]
    expect(sellable([FULL_GEAR, LITE_GEAR])).toEqual([FULL_GEAR, LITE_GEAR])
    expect(SR5ShopStock.canSell(entry(LITE_GEAR), {
      equip: true
    })).toBe(true)
  })

  it("the configuration writes an inclusion for a shadowed pack, an exclusion for any other", () => {
    globalThis.game.modules = modulesOf(MEGAPACK_FULL_ID, MEGAPACK_LITE_ID)
    // The Lite pack had been left off while it was alone: still off once the full one is turned off again
    const shelves = SR5ShopStock.shelvesFromBoxes({
      [FULL_GEAR]: true, [LITE_GEAR]: true, [OTHER]: false
    }, [LITE_GEAR, "gone.pack"], [])
    expect(shelves).toEqual({
      excluded: [LITE_GEAR, OTHER], included: [LITE_GEAR]
    })
    // Unticked: no inclusion, and the configuration window shows it unticked
    expect(SR5ShopStock.shelvesFromBoxes({
      [LITE_GEAR]: false
    }, [], [LITE_GEAR]).included).toEqual([])
    expect(SR5ShopStock.isShelf(LITE_GEAR, [], [])).toBe(false)
  })
})
