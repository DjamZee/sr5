import {
  describe, it, expect
} from 'vitest'
import {
  generateCommcode, needsCommcode, commcodeChange
} from '../modules/system/commcode-rules.js'

const device = (type, commcode = "") => ({
  type: "itemDevice", system: {
    type, commcode 
  }
})

describe('commcode given at once (relecture djamz.13)', () => {
  it('has the shape #XX-XXXX-XXXX-XX', () => {
    expect(generateCommcode()).toMatch(/^#[0-9A-Z]{2}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/)
  })

  it('never gives one already taken', () => {
    const draws = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    let i = 0
    const random = () => draws[i++] ?? 0
    const code = generateCommcode(["#00-0000-0000-00"], random)
    expect(code).not.toBe("#00-0000-0000-00")
    expect(code).toMatch(/^#I0-/)
  })

  it('goes to a commlink, a deck or an RCC with none, on a character', () => {
    expect(needsCommcode(device("commlink"), "actorPc")).toBe(true)
    expect(needsCommcode(device("cyberdeck"), "actorGrunt")).toBe(true)
    expect(needsCommcode(device("riggerCommandConsole"), "actorPc")).toBe(true)
    expect(needsCommcode(device("commlink", "#AB-1234-5678-CD"), "actorPc")).toBe(false)
    expect(needsCommcode(device("commlink"), "actorDevice")).toBe(false)
    expect(needsCommcode(device("headcase"), "actorPc")).toBe(false)
    expect(needsCommcode({
      type: "itemWeapon", system: {
      } 
    }, "actorPc")).toBe(false)
  })

  it('lets the owner change it once, the gamemaster always', () => {
    expect(commcodeChange({
      before: "#A", after: "#B" 
    })).toBe("first")
    expect(commcodeChange({
      before: "#A", after: "#B", edited: true 
    })).toBe("refused")
    expect(commcodeChange({
      before: "#A", after: "#A ", edited: true 
    })).toBe("allowed")
    expect(commcodeChange({
      isGM: true, before: "#A", after: "#B", edited: true 
    })).toBe("allowed")
  })
})
