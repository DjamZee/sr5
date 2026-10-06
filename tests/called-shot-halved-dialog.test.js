import {
  describe, it, expect, beforeEach, afterEach
} from "vitest"
import SR5_RollDialog from "../modules/rolls/roll-dialog.js"

//Aim for Perfection (Assassin's Primer p. 15): "Divide by two the cost of all Called Shots", a specific location included
describe("Aim for Perfection in the roll dialog", () => {
  let saved
  const shooter = halved => ({
    system: {
      specialProperties: {
        calledShotHalved: halved
      }
    }
  })
  beforeEach(() => {
    saved = globalThis.game.actors
  })
  afterEach(() => {
    globalThis.game.actors = saved
  })

  const pickLocation = async (halved, location, calledShot = "specificTarget") => {
    globalThis.game.actors = {
      get: () => shooter(halved)
    }
    const fields = {
      '[data-modifier="calledShot"]': {
        value: calledShot, style: {
        }
      }
    }
    const html = {
      querySelector: sel => (fields[sel] ??= {
        value: 0, style: {
        }
      }),
      querySelectorAll: () => [],
    }
    const dialogData = {
      owner: {
        actorId: "a"
      },
      dicePool: {
        base: 8, modifiers: []
      },
      limit: {
        modifiers: {
        }
      },
      various: {
      },
      combat: {
        calledShot: {
          name: calledShot, martialArtsModifiers: {
          }
        },
        actions: [],
      },
    }
    const roll = new SR5_RollDialog({
      position: {
      }, setPosition: () => {}
    }, null, dialogData)
    await roll._selectModifiers({
      currentTarget: {
        dataset: {
          target: "dicePoolModCalledShot", modifier: "calledShotSpecificTarget"
        }
      },
      target: {
        value: location
      },
    }, html, dialogData)
    return fields["[name=\"dicePoolModCalledShot\"]"]?.value ?? Object.values(fields).find(f => typeof f.value === "number" && f.value < 0)?.value
  }

  it("halves an eye shot from -10 to -5", async () => {
    expect(await pickLocation(false, "eye")).toBe(-10)
    expect(await pickLocation(true, "eye")).toBe(-5)
  })
  it("halves the location with Up the Ante too", async () => {
    expect(await pickLocation(true, "eye", "upTheAnte")).toBe(-7)
  })
})
