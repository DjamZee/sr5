import {
  describe, it, expect, beforeEach, vi
} from "vitest"

// Rapport de Jack, 2026-10-05, Priorité 1 : token bars where an empty and a wounded box were the
// same beige, and sheets that could not be resized nor kept their size.

import {
  TOKEN_BAR_EMPTY, tokenBarFilledColor
} from "../modules/interface/token-bar-colors.js"
import {
  clampSheetSize, minSheetSize, sheetSizeKey, sheetSizeOptions, sheetSizeSetPosition, SHEET_SIZE_SETTING
} from "../modules/interface/sheet-size.js"

describe("token bar colors", () => {
  it("a wounded box never has the empty box color", () => {
    for (const attr of ["statusBars.physical", "statusBars.stun", "statusBars.condition", "statusBars.matrix", undefined]) {
      expect(tokenBarFilledColor(attr)).not.toBe(TOKEN_BAR_EMPTY.color)
    }
  })

  it("stun is amber and matrix blue, apart from the red physical bar", () => {
    const physical = tokenBarFilledColor("statusBars.physical")
    expect(tokenBarFilledColor("statusBars.condition")).toBe(physical)
    expect(tokenBarFilledColor("statusBars.stun")).not.toBe(physical)
    expect(tokenBarFilledColor("statusBars.matrix")).not.toBe(physical)
  })

  it("a custom attribute on a bar is not drawn as a wound", () => {
    const wounds = ["physical", "condition", "stun", "matrix"].map(k => tokenBarFilledColor(`statusBars.${k}`))
    expect(tokenBarFilledColor("statusBars.overflow")).toBe(wounds[0])
    for (const attr of ["statusBars.edge", "specialAttributes.edge.augmented", "physical", undefined]) {
      expect(wounds).not.toContain(tokenBarFilledColor(attr))
    }
  })
})

describe("sheet size", () => {
  class Sheet { static DEFAULT_OPTIONS = {
    position: {
      width: 800, height: 618 
    } 
  } }
  const pc = {
    documentName: "Actor", type: "actorPc" 
  }
  let store

  beforeEach(() => {
    vi.useFakeTimers()
    store = {
    }
    globalThis.foundry = {
      utils: {
        deepClone: o => structuredClone(o) 
      } 
    }
    globalThis.game = {
      settings: {
        get: (_, key) => store[key],
        set: vi.fn((_, key, value) => { store[key] = value }),
      } 
    }
  })

  it("never goes below the default size", () => {
    expect(clampSheetSize({
      width: 500, height: 900 
    }, minSheetSize(Sheet))).toEqual({
      width: 800, height: 900 
    })
    expect(clampSheetSize({
      left: 10 
    }, minSheetSize(Sheet))).toEqual({
    })
  })

  it("reopens at the size remembered for the sheet type", () => {
    store[SHEET_SIZE_SETTING] = {
      [sheetSizeKey(pc)]: {
        width: 1000, height: 900 
      } 
    }
    const options = sheetSizeOptions(Sheet, {
      document: pc, position: {
        width: 800, height: 618 
      } 
    })
    expect(options.position).toEqual({
      width: 1000, height: 900 
    })
    // another type keeps its default
    const npc = sheetSizeOptions(Sheet, {
      document: {
        documentName: "Actor", type: "actorGrunt" 
      }, position: {
        width: 800, height: 618 
      } 
    })
    expect(npc.position).toEqual({
      width: 800, height: 618 
    })
  })

  it("remembers a resize, but not a mere move nor the default size", () => {
    const app = {
      constructor: Sheet, document: pc, position: {
      } 
    }
    const set = p => ({
      width: 800, height: 618, ...p 
    })
    sheetSizeSetPosition(app, {
      width: 800, height: 618 
    }, set)
    sheetSizeSetPosition(app, {
      left: 50, top: 20 
    }, set)
    vi.runAllTimers()
    expect(game.settings.set).not.toHaveBeenCalled()

    sheetSizeSetPosition(app, {
      width: 600, height: 700 
    }, set) // too narrow: raised to 800
    vi.runAllTimers()
    expect(store[SHEET_SIZE_SETTING]).toEqual({
      "Actor.actorPc": {
        width: 800, height: 700
      }
    })
  })

  it("a minimized window dragged around keeps the size chosen", () => {
    store[SHEET_SIZE_SETTING] = {
      "Actor.actorPc": {
        width: 1000, height: 900
      }
    }
    const app = {
      constructor: Sheet, document: pc, position: {
      }, minimized: true
    }
    const set = vi.fn(p => p)
    sheetSizeSetPosition(app, {
      left: 40, top: 30, width: 1000, height: 36
    }, set)
    vi.runAllTimers()
    expect(set).toHaveBeenCalledWith({
      left: 40, top: 30, width: 1000, height: 36
    }) // not raised to the floor either
    expect(store[SHEET_SIZE_SETTING]["Actor.actorPc"]).toEqual({
      width: 1000, height: 900
    })
    expect(game.settings.set).not.toHaveBeenCalled()
  })
})
