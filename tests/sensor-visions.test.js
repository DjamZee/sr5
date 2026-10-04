import {
  describe, it, expect
} from 'vitest'

// The visions of a drone or a device are those of its sensors (SR5 p. 446-449): before, a drone
// or a camera never had one, whatever enhancement it carried, and its token only had basic sight.

const {
  settleSensorVisions
} = await import('../modules/system/vision.js')
const {
  getDefaultLayout
} = await import('../modules/interface/default-layout.js')

const vision = (augmented = false, isActive = false) => ({
  hasVision: false, natural: false, augmented, isActive
})
const visions = () => ({
  astral: vision(), lowLight: vision(), thermographic: vision(), ultrasound: vision(), hasActiveVision: false
})

describe('sensor visions of a drone or a device', () => {
  it('a thermographic enhancement gives the camera a thermographic vision', () => {
    const v = visions()
    v.thermographic.augmented = true
    settleSensorVisions(v)
    expect(v.thermographic.hasVision).toBe(true)
    expect(v.lowLight.hasVision).toBe(false)
  })

  it('the vision in use stays in use while its sensor is there', () => {
    const v = visions()
    v.ultrasound = vision(true, true)
    settleSensorVisions(v)
    expect(v.ultrasound.isActive).toBe(true)
    expect(v.hasActiveVision).toBe(true)
  })

  it('the sensor gone, its vision is no longer in use', () => {
    const v = visions()
    v.lowLight = vision(false, true)
    settleSensorVisions(v)
    expect(v.lowLight.isActive).toBe(false)
    expect(v.hasActiveVision).toBe(false)
  })

  it('a sensor gives no astral sight', () => {
    const v = visions()
    v.astral.isActive = true
    settleSensorVisions(v)
    expect(v.astral.isActive).toBe(false)
  })
})

describe('the drone and device sheets show their vision types', () => {
  const blocks = layout => JSON.stringify(layout)
  it('drone', () => {
    expect(blocks(getDefaultLayout('SR5DroneSheet'))).toContain('"visions"')
  })
  it('device', () => {
    expect(blocks(getDefaultLayout('SR5AppareilSheet'))).toContain('"visions"')
  })
})
