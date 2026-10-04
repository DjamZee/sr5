import {
  describe, it, expect, beforeAll
} from "vitest"

import {
  SR5_EntityHelpers
} from "../modules/entities/helpers.js"
import {
  SR5
} from "../modules/config.js"

// Every actor's preparation sorted all the translation tables again. The tables already sorted are now skipped:
// the order must stay the one a full sort gives.

beforeAll(() => {
  globalThis.game.i18n ??= {
  }
  globalThis.game.i18n.lang = "fr"
  globalThis.game.i18n.localize = (key) => key
})

const order = () => Object.fromEntries(Object.entries(SR5).filter(([, v]) => v && typeof v === "object").map(([k, v]) => [k, Object.keys(v).join(",")]))

describe("sortTranslations cache", () => {
  it("gives the same order on the second call, from the cache", () => {
    SR5_EntityHelpers.invalidateSortedTranslations()
    SR5_EntityHelpers.sortTranslations(SR5)
    const first = order()
    const sortedTable = SR5.spiritTypes
    SR5_EntityHelpers.sortTranslations(SR5)
    expect(order()).toEqual(first)
    expect(SR5.spiritTypes).toBe(sortedTable)
  })

  it("sorts a table again when a key is added", () => {
    SR5_EntityHelpers.sortTranslations(SR5)
    SR5.spiritTypes.aaaCustom = "AAA"
    SR5_EntityHelpers.sortTranslations(SR5)
    expect(Object.keys(SR5.spiritTypes)[0]).toBe("aaaCustom")
    delete SR5.spiritTypes.aaaCustom
  })

  it("sorts a table again after an in-place rename once invalidated", () => {
    SR5_EntityHelpers.sortTranslations(SR5)
    const last = Object.keys(SR5.spiritTypes).at(-1)
    const saved = SR5.spiritTypes[last]
    SR5.spiritTypes[last] = "!first"
    SR5_EntityHelpers.invalidateSortedTranslations()
    SR5_EntityHelpers.sortTranslations(SR5)
    expect(Object.keys(SR5.spiritTypes)[0]).toBe(last)
    SR5.spiritTypes[last] = saved
    SR5_EntityHelpers.invalidateSortedTranslations()
  })

  it("sorts again when the language changes", () => {
    SR5_EntityHelpers.sortTranslations(SR5)
    const table = SR5.spiritTypes
    game.i18n.lang = "en"
    SR5_EntityHelpers.sortTranslations(SR5)
    expect(SR5.spiritTypes).not.toBe(table)
    game.i18n.lang = "fr"
  })
})
