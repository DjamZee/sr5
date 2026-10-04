import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes into CONFIG at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  MARTIAL_ARTS_LOCATIONS, martialArtsLocationKey, martialArtsLocationBonus
} from '../modules/rolls/roll-helpers/martialArtsLocation.js'
import {
  handleMartialArtsCalledShot
} from '../modules/rolls/roll-prepare-case/rollData-Weapon.js'
import {
  SR5
} from '../modules/config.js'

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

// Run & Gun p. 149, Dim Mak: "La pénalité pour les attaques ciblées (localisation spécifique) est réduite de 1."
// The location replaces the -4 of the called shot (p. 126): the technique must survive the location pick.
describe('martial arts location modifier', () => {
  it('lowers the penalty of the location the technique covers', async () => {
    const data = await handleMartialArtsCalledShot(rollData(), {
      system: {
        itemsProperties: {
          martialArts: {
            locationKnee: {
              isActive: false, modifier: {
                value: 1
              }
            }
          }
        }
      }
    })
    const modifiers = data.combat.calledShot.martialArtsModifiers
    expect(martialArtsLocationBonus(modifiers, "specificTarget", "knee")).toBe(1)
    expect(martialArtsLocationBonus(modifiers, "specificTarget", "hand")).toBe(0)
  })

  it('does not lower an ammo called shot that also picks a location', () => {
    expect(martialArtsLocationBonus({
      locationKnee: 1
    }, "upTheAnte", "knee")).toBe(0)
  })

  it('has one technique slot per location of the table (p. 127-128)', () => {
    expect(MARTIAL_ARTS_LOCATIONS).toHaveLength(16)
    for (const location of MARTIAL_ARTS_LOCATIONS) expect(SR5.calledShotsMartialArts[martialArtsLocationKey(location)]).toBeDefined()
  })
})
