import {
  describe, it, expect, vi
} from 'vitest'
import {
  fadingResistanceAttribute, FADING_RESISTANCE_HOOK, DEFAULT_FADING_ATTRIBUTE
} from '../modules/entities/actors/fading-resistance.js'
import {
  utilityActorSource
} from './fixtures/utility-actor-source.js'
import {
  foundryHooks
} from './fixtures/foundry-hooks.js'

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
      hooks: foundryHooks()
    })).toBe('willpower')
    expect(fadingResistanceAttribute(actor, 'resonance', {
      hooks: undefined
    })).toBe('willpower')
    expect(DEFAULT_FADING_ATTRIBUTE).toBe('willpower')
  })
  it('the attribute a subscriber names', () => {
    const fn = vi.fn(data => { data.attribute = 'charisma' })
    expect(fadingResistanceAttribute(actor, 'resonance', {
      hooks: foundryHooks({
        [FADING_RESISTANCE_HOOK]: fn
      })
    })).toBe('charisma')
    expect(fn.mock.calls[0][0]).toMatchObject({
      actor, persona: 'resonance'
    })
  })
  it('Willpower again when the value is not an attribute, or when a subscriber throws', () => {
    const hooks = fn => ({
      hooks: foundryHooks({
        [FADING_RESISTANCE_HOOK]: fn
      })
    })
    expect(fadingResistanceAttribute(actor, 'resonance', hooks(d => { d.attribute = 'magic' }))).toBe('willpower')
    expect(fadingResistanceAttribute(actor, 'resonance', hooks(d => { d.attribute = 3 }))).toBe('willpower')
    expect(fadingResistanceAttribute({
      system: {
        attributes: {
          willpower: {
          }
        }
      }
    }, 'resonance', hooks(d => { d.attribute = 'logic' }))).toBe('willpower')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(fadingResistanceAttribute(actor, 'resonance', hooks(() => { throw new Error('boom') }))).toBe('willpower')
    err.mockRestore()
  })
  // Relecture du 22/10, D1 of the 21/10 on this hook: Foundry's callAll would keep the Logic written before the error
  it('a subscriber that writes then throws has its answer thrown away, the others kept', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const saved = globalThis.Hooks
    const failing = d => {
      d.attribute = 'logic'
      throw new Error('module')
    }
    try {
      // Through globalThis.Hooks, as in the game: the former code went through its callAll, which swallowed the error
      globalThis.Hooks = foundryHooks({
        [FADING_RESISTANCE_HOOK]: failing
      })
      expect(fadingResistanceAttribute(actor, 'resonance')).toBe('willpower')
      globalThis.Hooks = foundryHooks({
        [FADING_RESISTANCE_HOOK]: [d => { d.attribute = 'charisma' }, failing]
      })
      expect(fadingResistanceAttribute(actor, 'nanite')).toBe('charisma')
      expect(err).toHaveBeenCalled()
    } finally {
      globalThis.Hooks = saved
      err.mockRestore()
    }
  })
  it('in the game, the subscribers of globalThis.Hooks, a "once" one heard once', () => {
    const saved = globalThis.Hooks
    globalThis.Hooks = foundryHooks()
    globalThis.Hooks.once(FADING_RESISTANCE_HOOK, d => { d.attribute = 'intuition' })
    try {
      expect(fadingResistanceAttribute(actor)).toBe('intuition')
      expect(fadingResistanceAttribute(actor)).toBe('willpower')
    } finally {
      globalThis.Hooks = saved
    }
  })
  it('the living persona reads it for its Fading pool', () => {
    const src = utilityActorSource()
    expect(src).toContain('const fadingAttribute = fadingResistanceAttribute(actor, personaKey)')
    expect(src).toContain('attributes[fadingAttribute].augmented.value')
  })
})
