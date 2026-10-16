import {
  describe, it, expect, vi
} from 'vitest'
import {
  readFileSync
} from 'fs'
import {
  fadingResistanceAttribute, FADING_RESISTANCE_HOOK, DEFAULT_FADING_ATTRIBUTE
} from '../modules/entities/actors/fading-resistance.js'

// The Fading attribute (SR5 p. 254: Resonance + Willpower) through the hook sr5.fadingResistance
// (lot « crochets techno » for the module technomancers-plus-sr5).

const actor = {
  system: {
    attributes: {
      willpower: {
      }, logic: {
      }, charisma: {
      }, intuition: {
      } 
    } 
  } 
}

describe('sr5.fadingResistance', () => {
  it('Willpower without a subscriber (the book)', () => {
    expect(fadingResistanceAttribute(actor, 'resonance', {
      call: () => {} 
    })).toBe('willpower')
    expect(DEFAULT_FADING_ATTRIBUTE).toBe('willpower')
  })
  it('the attribute a subscriber names', () => {
    const call = vi.fn((hook, data) => { if (hook === FADING_RESISTANCE_HOOK) data.attribute = 'charisma' })
    expect(fadingResistanceAttribute(actor, 'resonance', {
      call 
    })).toBe('charisma')
    expect(call.mock.calls[0][1]).toMatchObject({
      actor, persona: 'resonance' 
    })
  })
  it('Willpower again when the value is not an attribute, or when a subscriber throws', () => {
    expect(fadingResistanceAttribute(actor, 'resonance', {
      call: (h, d) => { d.attribute = 'magic' } 
    })).toBe('willpower')
    expect(fadingResistanceAttribute(actor, 'resonance', {
      call: (h, d) => { d.attribute = 3 } 
    })).toBe('willpower')
    expect(fadingResistanceAttribute({
      system: {
        attributes: {
          willpower: {
          } 
        } 
      } 
    }, 'resonance', {
      call: (h, d) => { d.attribute = 'logic' } 
    })).toBe('willpower')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(fadingResistanceAttribute(actor, 'resonance', {
      call: () => { throw new Error('boom') } 
    })).toBe('willpower')
    err.mockRestore()
  })
  it('the living persona reads it for its Fading pool', () => {
    const src = readFileSync(new URL('../modules/entities/actors/utilityActor.js', import.meta.url), 'utf8')
    expect(src).toContain('const fadingAttribute = fadingResistanceAttribute(actor, personaKey)')
    expect(src).toContain('attributes[fadingAttribute].augmented.value')
  })
})
