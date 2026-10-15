import {
  describe, it, expect, vi
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))
vi.mock('../modules/system/effectArea.js', () => ({
  SR5_EffectArea: {
    tokenAura: vi.fn(), checkIfTokenIsInTemplate: vi.fn()
  }
}))

const {
  SR5Combat
} = await import('../modules/system/srcombat.js')
const {
  sr5HookPreDeleteToken
} = await import('../modules/hooks/token.js')
const {
  SR5
} = await import('../modules/config.js')

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// Second lot of system fixes (Élise, 08/10): reviews of Firmine, Ermeline, Anatolie, Eudes, Gervaise
describe('the turn order (SR5 p. 161, CRIP) is the one Foundry reads the current combatant in', () => {
  const combat = {
    id: 'cb', round: 2
  }
  const combatant = (id, init, edge = 3) => ({
    id, initiative: init, parent: combat, flags: {
      sr5: {
        baseCombatantInitiative: init
      }
    }, actor: {
      system: {
        specialAttributes: {
          edge: {
            augmented: {
              value: edge
            }
          }
        }, attributes: {
          reaction: {
            augmented: {
              value: 4
            }
          }, intuition: {
            augmented: {
              value: 4
            }
          }
        }
      }
    }
  })

  it('sorts through _sortCombatants, without re-sorting after setupTurns', () => {
    const source = read('../modules/system/srcombat.js')
    expect(source).not.toMatch(/setupTurns\(\)\s*\{/)
    expect(SR5Combat.prototype._sortCombatants).toBeTypeOf('function')
    // Foundry calls it unbound
    const sort = SR5Combat.prototype._sortCombatants
    expect([combatant('a', 8), combatant('b', 12)].sort(sort).map(c => c.id)).toEqual(['b', 'a'])
  })

  it('a tie breaks the same way at every sort of the round', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map(id => combatant(id, 10))
    const first = [...list].sort(SR5Combat.sortByRERIC).map(c => c.id)
    for (let i = 0; i < 20; i++) {
      expect([...list].reverse().sort(SR5Combat.sortByRERIC).map(c => c.id)).toEqual(first)
    }
  })

  it('a copy of the combat, without id, sorts a tie the same way (Combatant._preUpdateOperation)', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map(id => combatant(id, 10))
    const copies = list.map(c => ({
      ...c, parent: {
        id: null, round: 2
      }
    }))
    expect([...copies].sort(SR5Combat.sortByRERIC).map(c => c.id)).toEqual([...list].sort(SR5Combat.sortByRERIC).map(c => c.id))
  })

  it('the Edge still comes first in a tie, and the rolled score stands in for a missing base', () => {
    const a = combatant('a', 10, 2), b = combatant('b', 10, 5)
    expect([a, b].sort(SR5Combat.sortByRERIC).map(c => c.id)).toEqual(['b', 'a'])
    const c = combatant('c', 12)
    delete c.flags.sr5.baseCombatantInitiative
    expect([a, c].sort(SR5Combat.sortByRERIC).map(c => c.id)).toEqual(['c', 'a'])
  })
})

describe('a new round writes only the combatants still there (Anatolie)', () => {
  it('one update, on the present ids', async () => {
    const updates = []
    const combat = {
      combatants: {
        contents: [{
          id: 'c1', isDefeated: false
        }, {
          id: 'c2', isDefeated: true
        }]
      },
      updateEmbeddedDocuments: vi.fn(async (type, list) => updates.push([type, list])),
    }
    await SR5Combat.updatePresentCombatants(combat, c => ({
      'flags.sr5.hasPlayed': c.isDefeated
    }))
    expect(updates).toEqual([['Combatant', [{
      _id: 'c1', 'flags.sr5.hasPlayed': false
    }, {
      _id: 'c2', 'flags.sr5.hasPlayed': true
    }]]])
    const source = read('../modules/system/srcombat.js')
    expect(source).not.toContain('combatant.setFlag("sr5", "hasPlayed"')
    expect(source).toContain('if (!combat.combatants.has(combatant.id)) continue')
  })
})

describe('a token deleted without a canvas (Anatolie)', () => {
  it('does not throw', () => {
    const saved = globalThis.canvas
    globalThis.canvas = {
    }
    expect(() => sr5HookPreDeleteToken({
      id: 't1'
    })).not.toThrow()
    globalThis.canvas = saved
  })
})

describe('labels', () => {
  it('hiding an object is an action source (Ermeline, B5)', () => {
    expect(SR5.actionSources.concealItem).toBe('SR5.ActionSourceConcealItem')
    for (const lang of ['fr', 'en']) expect(JSON.parse(read(`../lang/${lang}.json`))['SR5.ActionSourceConcealItem']).toBeTruthy()
  })

  it('every modifier type the item computations write has a label (Eudes)', () => {
    const source = read('../modules/entities/items/utilityItem.js') + read('../modules/entities/items/entityItem.js')
    const types = new Set([...source.matchAll(/updateModifier\([^;]*?,\s*["']([a-zA-Z]+)["']\s*,/g)].map(m => m[1]))
    types.add('metatype')
    for (const type of types) expect(SR5.modifierTypes[type], type).toBeTruthy()
    expect(read('../modules/entities/items/itemSheet.js')).toContain('[${typeLabel}]')
  })
})

describe('Firmine\'s review', () => {
  it('I2: the drug designer\'s button follows canOfferDrugDesign (the "objects" lock lifted included)', () => {
    // Relecture djamz.13, R1: the button left the sheet for the Items tab, where the player picks her character
    const designer = read('../modules/interface/drug-designer.js')
    expect(designer).toContain('canOfferDrugDesign(a, user)')
    expect(designer).toContain('if (!game.user.isGM && !designableActors().length) return')
    expect(read('../templates/actors/_partials/right-tabs/gear/variousGear.hbs')).not.toContain('drug-designer-open')
  })

  it('I5: a stored ammunition stack is not counted twice', () => {
    expect(read('../modules/entities/actors/baseSheet.js')).toContain('i.type === "itemAmmunition" ? 1 : (i.system.quantity ?? 1)')
  })

  it('the cart counts the Essence the till counts (sr5.essenceCostFor)', () => {
    const source = read('../modules/interface/shop-window.js')
    expect(source).toMatch(/cartEssence \+= [\s\S]{0,120}essenceCostFor\(buyer/)
  })
})
