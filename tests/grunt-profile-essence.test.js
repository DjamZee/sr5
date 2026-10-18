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

// A grunt's profile prints its Essence (SR5 p. 381): without implants on the sheet, it stayed at 6 (Philippine#6139, 16/10)
describe("Essence typed on a grunt's profile", () => {
  const template = readFileSync(new URL("../templates/actors/_partials/left-tabs/derived/essence.hbs", import.meta.url), "utf8")

  it("is a field of the grunt sheet only", () => {
    expect(template).toContain(`{{#if (eq actor.type 'actorGrunt')}}`)
    expect(template).toContain(`name="system.essence.base"`)
    const field = template.indexOf(`name="system.essence.base"`)
    expect(template.lastIndexOf(`{{#if (eq actor.type 'actorGrunt')}}`, field)).toBeGreaterThan(-1)
  })

  it("is lowered further by the implants on the sheet", () => {
    const actor = {
      items: [],
      system: {
        essence: {
          base: 4.5, value: 0, holeAmount: 0, holeBase: 0,
          modifiers: [{
            source: "Datajack", type: "itemAugmentation", value: -0.1
          }],
        },
      },
    }
    SR5_CharacterUtility.updateEssence(actor)
    expect(actor.system.essence.value).toBeCloseTo(4.4)
  })
})
