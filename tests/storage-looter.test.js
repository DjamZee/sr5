import {
  describe, it, expect, afterEach, beforeAll
} from 'vitest'
import {
  canLoot
} from '../modules/interface/storage-rules.js'

const actor = (id, type) => ({
  id, type, name: id, img: '', isOwner: true
})
const token = a => ({
  actor: a
})

const bag = actor('bag', 'actorStorage')
const runner = actor('runner', 'actorPc')
const commlink = actor('commlink', 'actorDevice')

// Foundry's actor sheet, which the storage sheet builds on
globalThis.foundry.applications.sheets ??= {
  ActorSheetV2: class {}
}

// The storage sheet pulls in most of the system: loaded once, outside any test's own time limit,
// since under the full parallel suite this first import alone can pass the 5 s a test is given.
let SR5StorageSheet
beforeAll(async () => {
  ({
    SR5StorageSheet
  } = await import('../modules/entities/actors/storageSheet.js'))
})

async function looterOf(controlled, placeables) {
  const shown = {
  }
  globalThis.canvas.tokens = {
    controlled, placeables
  }
  globalThis.foundry.applications.handlebars = {
    renderTemplate: async (_path, data) => {
      shown.candidates = data.candidates.map(c => c.id)
      return ''
    }
  }
  globalThis.foundry.applications.api.DialogV2 = {
    wait: async () => ({
      action: 'cancel'
    })
  }
  const sheet = Object.create(SR5StorageSheet.prototype)
  Object.defineProperty(sheet, 'actor', {
    value: bag
  })
  const chosen = await sheet._looter()
  return {
    chosen, shown
  }
}

describe('who takes from a storage put down (SR5 p. 216: a device is a piece of electronics)', () => {
  afterEach(() => {
    delete globalThis.canvas.tokens
  })

  it('is never a device, a storage or a Matrix entity', () => {
    expect(canLoot(runner)).toBe(true)
    expect(canLoot(actor('grunt', 'actorGrunt'))).toBe(true)
    expect(canLoot(commlink)).toBe(false)
    expect(canLoot(bag)).toBe(false)
    expect(canLoot(actor('sprite', 'actorSprite'))).toBe(false)
    expect(canLoot(actor('agent', 'actorAgent'))).toBe(false)
  })

  it('leaves a device out of the list of who takes', async () => {
    const {
      shown 
    } = await looterOf([], [token(bag), token(commlink), token(runner)])
    expect(shown.candidates).toEqual(['runner'])
  })

  it('does not take a selected device as the one who takes', async () => {
    const {
      chosen 
    } = await looterOf([token(commlink)], [token(bag), token(commlink), token(runner)])
    expect(chosen).toBeNull()
  })
})
