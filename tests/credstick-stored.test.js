import {
  describe, it, expect
} from 'vitest'
import {
  SR5Credstick
} from '../modules/interface/credstick.js'
import {
  isStorable, isStoredAway
} from '../modules/interface/storage-rules.js'

// Moving money writes a ledger line and a chat line
globalThis.foundry.documents ??= {
  ChatMessage: {
    create: async () => {}, getSpeaker: () => ({
    })
  },
}

const stash = {
  _id: 'stashId', type: 'itemStorage', system: {
    type: 'stash'
  }
}
const stick = (funds, storedIn = '') => {
  const item = {
    type: 'itemGear',
    name: 'stick',
    system: {
      isCredstick: true, storedIn, funds: {
        value: funds, max: 0
      }
    },
  }
  item.update = async changes => {
    item.system.funds.value = changes['system.funds.value']
  }
  return item
}
const actor = (...items) => ({
  items
})
// An owner whose ledger lines land in their items, as in the game
const bearer = (...items) => {
  const owner = {
    ...actor(...items), isOwner: true, name: 'bearer', system: {
      nuyen: {
        modifiers: []
      }
    }
  }
  // The actor turns each ledger line into a modifier typed by its direction
  owner.createEmbeddedDocuments = async (_type, docs) => {
    for (const doc of docs) {
      owner.system.nuyen.modifiers.push({
        source: doc.name, type: `transaction_${doc.system.type}`, value: doc.system.amount
      })
    }
  }
  for (const item of items) item.parent = owner
  return owner
}

describe('credsticks left in a storage', () => {
  it('can be put away like any other gear', () => {
    expect(isStorable(stick(100), stash)).toBe(true)
  })

  it('are not cash on hand', () => {
    const owner = actor(stash, stick(100), stick(5000, 'stashId'))
    expect(SR5Credstick.carried(owner)).toHaveLength(1)
    expect(SR5Credstick.cashOnHand(owner)).toBe(100)
  })

  it('count again once taken out', () => {
    expect(SR5Credstick.cashOnHand(actor(stash, stick(100), stick(5000)))).toBe(5100)
  })

  it('cannot move money until taken out', async () => {
    const stored = stick(5000, 'stashId')
    const owner = bearer(stash, stored)
    expect(await SR5Credstick.deposit(owner, stored, 1000)).toBe(false)
    expect(await SR5Credstick.withdraw(owner, stored, 1000)).toBe(false)
    expect(stored.system.funds.value).toBe(5000)
    expect(SR5Credstick.ledgerBalance(owner)).toBe(0)
  })

  it('move money again once taken out', async () => {
    const stick1 = stick(5000)
    const owner = bearer(stash, stick1)
    expect(await SR5Credstick.deposit(owner, stick1, 1000)).toBe(true)
    expect(stick1.system.funds.value).toBe(4000)
    expect(SR5Credstick.ledgerBalance(owner)).toBe(1000)
    expect(await SR5Credstick.withdraw(owner, stick1, 400)).toBe(true)
    expect(stick1.system.funds.value).toBe(4400)
    expect(SR5Credstick.ledgerBalance(owner)).toBe(600)
  })
})

describe('a credstick someone else bears', () => {
  it('cannot feed another ledger, stored or carried', async () => {
    const stored = stick(5000, 'stashId')
    const carried = stick(300)
    bearer({
      ...stash
    }, stored, carried)
    const other = bearer()
    expect(await SR5Credstick.deposit(other, stored, 100)).toBe(false)
    expect(await SR5Credstick.deposit(other, carried, 100)).toBe(false)
    expect(await SR5Credstick.withdraw(other, carried, 100)).toBe(false)
    expect(stored.system.funds.value).toBe(5000)
    expect(carried.system.funds.value).toBe(300)
    expect(SR5Credstick.ledgerBalance(other)).toBe(0)
  })
})

describe('an item whose storage is gone', () => {
  it('is back in hand, not stored', () => {
    const orphan = stick(5000, 'deletedId')
    expect(isStoredAway(orphan, actor(orphan))).toBe(false)
    expect(isStoredAway(stick(5000, 'stashId'), actor(stash))).toBe(true)
  })

  it('counts as cash and can still move money', async () => {
    const orphan = stick(5000, 'deletedId')
    const owner = bearer(stick(100), orphan)
    expect(SR5Credstick.cashOnHand(owner)).toBe(5100)
    expect(await SR5Credstick.deposit(owner, orphan, 1000)).toBe(true)
    expect(orphan.system.funds.value).toBe(4000)
  })

  it('points at something that is not a storage', () => {
    const other = {
      _id: 'gunId', type: 'itemWeapon'
    }
    expect(isStoredAway(stick(5000, 'gunId'), actor(other))).toBe(false)
  })
})
