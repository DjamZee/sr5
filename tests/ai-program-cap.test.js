import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

beforeEach(() => {
  globalThis.game = {
    ...globalThis.game,
    i18n: {
      localize: key => key,
      format: (key, data) => `${key} ${data.current}/${data.max}`,
    },
  }
})

/** An actor whose program counters are already prepared, with or without an active device */
function actor({
  type = "actorPc", special = "depth", depth = 3, slots = 5, current = 0, device = true
} = {
}) {
  return {
    type,
    items: device ? [{
      type: "itemDevice", system: {
        isActive: true
      }
    }] : [],
    system: {
      activeSpecialAttribute: special,
      specialAttributes: {
        depth: {
          augmented: {
            value: depth
          }
        }
      },
      matrix: {
        programsCurrentActive: {
          base: 0, value: current, modifiers: []
        },
        programsMaximumActive: {
          base: 0, value: slots, modifiers: [{
            source: "Cyberdeck", type: "device", value: slots
          }]
        },
      },
    },
  }
}

describe("AI program cap (DjamZ's ruling: min of Depth x 2 and the device's slots)", () => {
  it("takes the smaller of Depth x 2 and the slots", () => {
    expect(SR5_CharacterUtility.aiProgramCap(2, 5)).toBe(4)
    expect(SR5_CharacterUtility.aiProgramCap(4, 5)).toBe(5)
  })

  it("lowers the cap to Depth x 2 and names it in the tooltip", () => {
    const a = actor({
      depth: 2, slots: 5
    })
    SR5_CharacterUtility.applyAIProgramCap(a)
    const max = a.system.matrix.programsMaximumActive
    expect(max.value).toBe(4)
    expect(max.modifiers).toHaveLength(1)
    expect(max.modifiers[0].source).toBe("SR5.Depth 2 × 2")
  })

  it("keeps the device as the source when its slots are the lower", () => {
    const a = actor({
      depth: 4, slots: 5
    })
    SR5_CharacterUtility.applyAIProgramCap(a)
    expect(a.system.matrix.programsMaximumActive.value).toBe(5)
    expect(a.system.matrix.programsMaximumActive.modifiers[0].source).toBe("Cyberdeck")
  })

  it("forgets what a first pass wrote while Depth was still 0", () => {
    const a = actor({
      depth: 0, slots: 5
    })
    SR5_CharacterUtility.applyAIProgramCap(a)
    expect(a.system.matrix.programsMaximumActive.value).toBe(0)
    // second pass: Depth is known and the device writes its slots again
    a.system.specialAttributes.depth.augmented.value = 3
    a.system.matrix.programsMaximumActive.modifiers.push({
      source: "Commlink", type: "deviceRating", value: 5
    })
    SR5_CharacterUtility.applyAIProgramCap(a)
    const max = a.system.matrix.programsMaximumActive
    expect(max.value).toBe(5)
    expect(max.modifiers.map(m => m.source)).toEqual(["Commlink"])
  })

  it("leaves a character who is not an AI alone", () => {
    const a = actor({
      special: "magic", depth: 1, slots: 5
    })
    SR5_CharacterUtility.applyAIProgramCap(a)
    expect(a.system.matrix.programsMaximumActive.value).toBe(5)
  })
})

describe("AI program cap warning (non-blocking)", () => {
  it("warns when one program too many is loaded", () => {
    expect(SR5_CharacterUtility.aiProgramCapWarning(actor({
      slots: 4, current: 4
    }))).toBe("SR5.AIProgramsCapReached 5/4")
  })

  it("stays silent under the cap", () => {
    expect(SR5_CharacterUtility.aiProgramCapWarning(actor({
      slots: 4, current: 3
    }))).toBeNull()
  })

  it("warns an AI outside any device that it cannot load programs (Data Trails p. 157)", () => {
    expect(SR5_CharacterUtility.aiProgramCapWarning(actor({
      device: false, slots: 0
    }))).toBe("SR5.AIProgramsNoDevice")
  })

  it("never warns a character who is not an AI", () => {
    expect(SR5_CharacterUtility.aiProgramCapWarning(actor({
      special: "magic", slots: 1, current: 3
    }))).toBeNull()
  })
})
