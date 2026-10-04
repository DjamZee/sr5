import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

// N46: Denial of Service and Popup read fromUuid(itemUuid).name with no guard, and threw when the
// card aimed at a persona (no itemUuid) or at a device deleted since.

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_MatrixHelpers
} = await import('../modules/rolls/roll-helpers/matrix.js')

const target = () => ({
  name: 'Cible', createEmbeddedDocuments: vi.fn(async () => {})
})
const card = itemUuid => ({
  previousMessage: {
    hits: 4
  }, roll: {
    hits: 1
  }, target: {
    itemUuid
  }, test: {
    typeSub: 'popup'
  }
})

beforeEach(() => {
  ui.notifications = {
    info: vi.fn()
  }
  globalThis.fromUuid = vi.fn(async uuid => uuid === 'Actor.c.Item.d' ? {
    name: 'Commlink'
  } : null)
})

describe('Device name of a matrix effect', () => {
  it('names the device when the card has one', async () => {
    expect(await SR5_MatrixHelpers.targetDeviceName(card('Actor.c.Item.d'), target())).toBe('Commlink')
  })

  it('names the target when there is no device, or it is gone', async () => {
    expect(await SR5_MatrixHelpers.targetDeviceName(card(''), target())).toBe('Cible')
    expect(await SR5_MatrixHelpers.targetDeviceName(card('Actor.c.Item.gone'), target())).toBe('Cible')
  })

  it('lays Denial of Service on a persona without throwing', async () => {
    const t = target()
    await SR5_MatrixHelpers.applyDenialOfServiceEffect(card(''), {
      id: 's', name: 'Source'
    }, t)
    expect(t.createEmbeddedDocuments.mock.calls[0][1][0]['system.target']).toBe('Cible')
  })
})
