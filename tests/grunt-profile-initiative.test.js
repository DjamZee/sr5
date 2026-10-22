import {
  describe, it, expect, vi
} from 'vitest'
import {
  readFileSync
} from "node:fs"

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

function grunt(profileInitiative) {
  const init = () => ({
    base: 0, value: 0, modifiers: [], dice: {
      base: 0, value: 0, modifiers: []
    }
  })
  return {
    type: "actorGrunt",
    items: [],
    system: {
      profileInitiative,
      attributes: {
        intuition: {
          augmented: {
            value: 3
          }
        },
        reaction: {
          augmented: {
            value: 4
          }
        },
      },
      initiatives: {
        physicalInit: init(), astralInit: init(), matrixInit: init()
      },
      penalties: {
        condition: {
          actual: {
            value: 0
          }
        }
      },
    },
  }
}

// A grunt's profile prints its Initiative (SR5 p. 381): a bonus typed on the sheet was wiped at every preparation
// (Philippine#6139, 16/10). It now lives outside the initiatives, which are reset, and is counted after the reset
describe("Initiative modifier typed on a grunt's profile", () => {
  const template = readFileSync(new URL("../templates/actors/_partials/left-tabs/coreInfos/initiatives.hbs", import.meta.url), "utf8")

  it("is a field of the grunt sheet only", () => {
    expect(template).toContain(`name="system.profileInitiative.score"`)
    expect(template).toContain(`name="system.profileInitiative.dice"`)
    const field = template.indexOf(`name="system.profileInitiative.score"`)
    expect(template.lastIndexOf(`{{#if (eq actor.type 'actorGrunt')}}`, field)).toBeGreaterThan(-1)
  })

  it("adds its score and dice to the physical initiative", () => {
    const actor = grunt({
      score: 2, dice: 2
    })
    SR5_CharacterUtility.updateInitiativePhysical(actor)
    expect(actor.system.initiatives.physicalInit.value).toBe(9)
    expect(actor.system.initiatives.physicalInit.dice.value).toBe(3)
  })

  it("leaves a grunt without profile modifier at REA + INT + 1D6", () => {
    const actor = grunt({
      score: 0, dice: 0
    })
    SR5_CharacterUtility.updateInitiativePhysical(actor)
    expect(actor.system.initiatives.physicalInit.value).toBe(7)
    expect(actor.system.initiatives.physicalInit.dice.value).toBe(1)
  })

  it("still caps the dice at 5D6 (SR5 p. 159)", () => {
    const actor = grunt({
      score: 0, dice: 6
    })
    SR5_CharacterUtility.updateInitiativePhysical(actor)
    expect(actor.system.initiatives.physicalInit.dice.value).toBe(5)
  })
})
