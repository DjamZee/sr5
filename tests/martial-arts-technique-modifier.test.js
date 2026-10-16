import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  handleMartialArtsCalledShot
} from '../modules/rolls/roll-prepare-case/rollData-Weapon.js'

function rollData(){
  return {
    combat: {
      calledShot: {
        martialArts: {
        }, martialArtsModifiers: {
        }
      }
    }
  }
}

function actorWith(martialArts){
  return {
    system: {
      itemsProperties: {
        martialArts
      }
    }
  }
}

// Run & Gun p. 125: anyone may Disarm, Feint or Pin; a technique only lowers the penalty.
// Griffes libératrices (p. 150), Capture précise (p. 148), Croc brisé (p. 149): "réduite de 1",
// with no need for the matching "Attaque ciblée" technique.
describe('handleMartialArtsCalledShot', () => {
  it('reads a technique modifier even without the called shot flag', async () => {
    const data = await handleMartialArtsCalledShot(rollData(), actorWith({
      disarm: {
        isActive: false, modifier: {
          value: 1
        }
      },
    }))
    expect(data.combat.calledShot.martialArtsModifiers.disarm).toBe(1)
    expect(data.combat.calledShot.martialArts.disarm).toBeUndefined()
  })

  it('still sets the flag of a technique that unlocks the called shot', async () => {
    const data = await handleMartialArtsCalledShot(rollData(), actorWith({
      reversal: {
        isActive: true, modifier: {
          value: 1
        }
      },
    }))
    expect(data.combat.calledShot.martialArts.reversal).toBe(true)
    expect(data.combat.calledShot.martialArtsModifiers.reversal).toBe(1)
  })

  // Run & Gun p. 147: the "Attaque ciblée" technique of a called shot open to all lowers its penalty by 1.
  // Measured in game (lot 17a): Clouer + Capture précise gave -3 on a bow, the book -2
  it('lowers by 1 the penalty of an open called shot whose technique is known', async () => {
    const data = await handleMartialArtsCalledShot(rollData(), actorWith({
      pin: {
        isActive: true, modifier: {
          value: 1
        }
      },
      feint: {
        isActive: true, modifier: {
          value: 0
        }
      },
      reversal: {
        isActive: true, modifier: {
          value: 0
        }
      },
    }))
    expect(data.combat.calledShot.martialArtsModifiers.pin).toBe(2)
    expect(data.combat.calledShot.martialArtsModifiers.feint).toBe(1)
    // Renversement de situation is only open to its technique: knowing it unlocks it, no reduction
    expect(data.combat.calledShot.martialArtsModifiers.reversal).toBeUndefined()
  })
})

// Jiao Di (Run & Gun p. 150) lowers the Knockdown penalty, Choquer (p. 148) the Shake Up one:
// both need a modifier slot in the martial arts table, which feeds the effect editor
describe('SR5.calledShotsMartialArts', () => {
  it('offers Knockdown and Shake Up to technique modifiers', async () => {
    const {
      SR5
    } = await import('../modules/config.js')
    expect(SR5.calledShotsMartialArts.knockdown).toBe('SR5.CS_Knockdown')
    expect(SR5.calledShotsMartialArts.shakeUp).toBe('SR5.CS_ShakeUp')
  })

  // Percussion (Run & Gun p. 151) lowers Blast Out of Hand, Randori (p. 151) Dirty Trick or Vitals
  it('offers Blast Out of Hand, Dirty Trick and Vitals to technique modifiers', async () => {
    const {
      SR5
    } = await import('../modules/config.js')
    expect(SR5.calledShotsMartialArts.blastOutOfHand).toBe('SR5.CS_BlastOutOfHand')
    expect(SR5.calledShotsMartialArts.dirtyTrick).toBe('SR5.CS_DirtyTrick')
    expect(SR5.calledShotsMartialArts.vitals).toBe('SR5.CS_Vitals')
  })
})
