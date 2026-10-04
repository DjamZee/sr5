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
})
