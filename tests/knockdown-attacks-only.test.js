import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_ActorHelper
} from '../modules/entities/actors/entityActor-helpers.js'

// SR5 p. 195: only a single attack knocks down, when its damage after resistance exceeds the
// Physical limit (lowered by gel rounds) or reaches 10 boxes
describe('knocksDown', () => {
  it('knocks down when an attack exceeds the Physical limit', () => {
    expect(SR5_ActorHelper.knocksDown(6, 4, 0, true)).toBe(true)
  })

  it('does not knock down when an attack only equals the Physical limit', () => {
    expect(SR5_ActorHelper.knocksDown(4, 4, 0, true)).toBe(false)
  })

  it('lowers the limit by 2 for gel rounds (SR5 p. 195 example)', () => {
    expect(SR5_ActorHelper.knocksDown(5, 6, -2, true)).toBe(true)
  })

  it('always knocks down from 10 boxes of a single attack', () => {
    expect(SR5_ActorHelper.knocksDown(10, 12, 0, true)).toBe(true)
  })

  it('never knocks down from damage that is not an attack, as the 6 Stun of a Cram crash', () => {
    expect(SR5_ActorHelper.knocksDown(6, 4, 0, false)).toBe(false)
    expect(SR5_ActorHelper.knocksDown(12, 4, 0, false)).toBe(false)
    expect(SR5_ActorHelper.knocksDown(6, 4, 0, undefined)).toBe(false)
  })
})
