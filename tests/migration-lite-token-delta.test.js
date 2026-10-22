import {
  describe, it, expect, vi
} from 'vitest'

vi.hoisted(() => {
  globalThis.foundry.utils.isEmpty = (obj) => !obj || Object.keys(obj).length === 0
})

import Migration from '../modules/migration.js'

// Gédéon, D5: the Lite images migration skipped the delta of unlinked tokens. An item changed on such a token kept
// modules/megapack-sr5-lite/… and showed a broken icon once the Lite module was gone. And the journals were not read.

const LITE = 'modules/megapack-sr5-lite/Assets/'
const SYS = 'systems/sr5/megapack/Assets/'

function token(delta, actorLink = false) {
  const actor = {
    update: vi.fn(async () => {}), updateEmbeddedDocuments: vi.fn(async () => {})
  }
  return {
    actorLink, actor, delta: delta && {
      toObject: () => structuredClone(delta)
    }
  }
}

describe('Lite images in an unlinked token\'s delta', () => {
  it('sends the delta\'s own fields and its changed items to the system\'s copy, through the synthetic actor', async () => {
    const t = token({
      _id: 'tok', img: `${LITE}ganger.webp`, items: [{
        _id: 'it1', img: `${LITE}knife.webp`, name: 'Couteau', effects: []
      }, {
        _id: 'it2', img: 'icons/svg/item-bag.svg'
      }]
    })
    expect(await Migration.migrateLiteTokenDelta(t)).toBe(2)
    expect(t.actor.update).toHaveBeenCalledWith({
      img: `${SYS}ganger.webp`
    }, {
      render: false
    })
    expect(t.actor.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [{
      _id: 'it1', img: `${SYS}knife.webp`
    }], {
      render: false
    })
  })
  it('writes nothing for a delta already migrated, a linked token, or a token without delta', async () => {
    const done = token({
      _id: 'tok', img: `${SYS}ganger.webp`, items: []
    })
    expect(await Migration.migrateLiteTokenDelta(done)).toBe(0)
    expect(done.actor.update).not.toHaveBeenCalled()
    expect(await Migration.migrateLiteTokenDelta(token({
      img: `${LITE}x.webp`
    }, true))).toBe(0)
    expect(await Migration.migrateLiteTokenDelta(token(null))).toBe(0)
  })
  it('reads the journals and their pages too', () => {
    expect(Migration.LITE_EMBEDDED.JournalEntry).toEqual({
      pages: 'JournalEntryPage'
    })
  })
})
