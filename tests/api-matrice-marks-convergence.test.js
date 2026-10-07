import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import fs from 'node:fs'

import {
  MAX_MARKS, markCount, markTarget, markable, actorRef, placeMarks, _socketPlaceMarks, SR5MatrixApi
} from '../modules/system/matrix-api.js'

// API pour Matrice v1, second round: what the module Matrice v1 still needs of the system (A11 marks put by a module,
// A12 the convergence, A5 the hook after a matrix action), through the system's own paths, with no new rule.

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

// A device, an actor carrying it, and a world where fromUuid finds them
function world(){
  const deck = {
    documentName: 'Item', uuid: 'Actor.dek.Item.deck', type: 'itemDevice', system: {
      isActive: true, marks: []
    }
  }
  const decker = {
    documentName: 'Actor', id: 'dek', uuid: 'Actor.dek', name: 'Decker', isToken: false, items: [deck], system: {
      matrix: {
      }
    }
  }
  deck.parent = decker
  const host = {
    documentName: 'Actor', id: 'hst', uuid: 'Actor.hst', name: 'Serveur', isToken: false, items: [], system: {
      matrix: {
        deviceType: 'host'
      }
    }
  }
  const token = {
    documentName: 'Token', id: 'tok', actor: {
      documentName: 'Actor', id: 'ice', isToken: true, token: {
        id: 'tok'
      }, uuid: 'Scene.s.Token.tok.Actor.ice', name: 'CI', items: [], system: {
      }
    }
  }
  const all = {
    [deck.uuid]: deck, [decker.uuid]: decker, [host.uuid]: host
  }
  globalThis.fromUuid = async uuid => all[uuid] ?? null
  return {
    deck, decker, host, token
  }
}

function helpers(){
  return {
    markItem: vi.fn(async () => {}), emitForGM: vi.fn(async () => {}), converge: vi.fn(async () => true),
  }
}

beforeEach(() => {
  globalThis.ui = {
    notifications: {
      info: vi.fn(), warn: vi.fn()
    }
  }
  globalThis.game = {
    user: {
      isGM: true
    },
    users: {
      activeGM: {
        id: 'gm'
      }, get: id => ({
        id, name: id, isGM: false
      })
    },
    i18n: {
      localize: k => k, format: (k, d) => `${k} ${JSON.stringify(d)}`, has: () => false
    },
  }
})

describe('A11: marks put by a module (game.sr5.matrix.placeMarks)', () => {
  it('takes one to three marks, and brings more back to three (SR5 p. 237)', () => {
    expect(MAX_MARKS).toBe(3)
    expect(markCount(1)).toBe(1)
    expect(markCount(3)).toBe(3)
    expect(markCount(5)).toBe(3)
    expect(markCount('2')).toBe(2)
    for (const wrong of [0, -1, 1.5, 'x', null, undefined]) expect(markCount(wrong)).toBeNull()
  })

  it('reads an item as its device and its holder, an actor or a token as the actor', async () => {
    const {
      deck, decker, token
    } = world()
    expect(await markTarget(deck)).toEqual({
      actor: decker, itemUuid: deck.uuid
    })
    expect(await markTarget('Actor.dek')).toEqual({
      actor: decker, itemUuid: null
    })
    expect(await markTarget(token)).toEqual({
      actor: token.actor, itemUuid: null
    })
    expect(await markTarget('Actor.none')).toBeNull()
  })

  it('names an unlinked token by its token\'s id, as the system\'s helpers do', () => {
    const {
      decker, token
    } = world()
    expect(actorRef(decker)).toBe('dek')
    expect(actorRef(token.actor)).toBe('tok')
  })

  it('marks only what can carry a mark: an item, an active device, the persona of an AI', () => {
    const {
      decker, host
    } = world()
    expect(markable({
      actor: decker, itemUuid: null
    })).toBe(true)
    expect(markable({
      actor: host, itemUuid: null
    })).toBe(false)
    expect(markable({
      actor: host, itemUuid: 'x'
    })).toBe(true)
    expect(markable({
      actor: {
        items: [], system: {
          activeSpecialAttribute: 'depth'
        }
      }, itemUuid: null
    })).toBe(true)
  })

  it('on the GM\'s browser, goes through the system\'s markItem (device, persona, PAN master, host tokens)', async () => {
    const {
      deck, decker, token
    } = world()
    const h = helpers()
    expect(await placeMarks(token.actor, deck, 3, {
      source: 'convergence'
    }, h)).toBe(true)
    expect(h.markItem).toHaveBeenCalledWith('dek', 'tok', 3, deck.uuid, false)
    expect(await placeMarks(token.actor, decker, 5, {
      watchdog: true
    }, h)).toBe(true)
    expect(h.markItem).toHaveBeenLastCalledWith('dek', 'tok', 3, undefined, true)
    expect(h.emitForGM).not.toHaveBeenCalled()
  })

  it('puts nothing without an attacker, a target that carries marks, or a right count', async () => {
    const {
      deck, decker, host
    } = world()
    const h = helpers()
    expect(await placeMarks(null, deck, 1, {
    }, h)).toBe(false)
    expect(await placeMarks(decker, 'Actor.none', 1, {
    }, h)).toBe(false)
    expect(await placeMarks(decker, host, 1, {
    }, h)).toBe(false)
    expect(await placeMarks(host, deck, 0, {
    }, h)).toBe(false)
    expect(h.markItem).not.toHaveBeenCalled()
  })

  it('on a player\'s browser, asks the active GM, who writes', async () => {
    const {
      deck, host
    } = world()
    game.user.isGM = false
    const h = helpers()
    expect(await placeMarks(host, deck, 2, {
      source: 'convergence'
    }, h)).toBe('relayed')
    expect(h.markItem).not.toHaveBeenCalled()
    expect(h.emitForGM).toHaveBeenCalledWith('apiPlaceMarks', {
      attackerUuid: 'Actor.hst', targetUuid: deck.uuid, count: 2, source: 'convergence', watchdog: false,
    })
    game.users.activeGM = null
    game.users.find = () => null
    expect(await placeMarks(host, deck, 2, {
    }, h)).toBe(false)
    expect(ui.notifications.warn).toHaveBeenCalledWith('SR5.WARN_NoActiveGM')
  })

  it('on the GM\'s browser, a request for a target its sender does not own waits for the GM\'s word', async () => {
    world()
    const confirm = vi.fn(async () => false)
    globalThis.foundry = {
      utils: {
        escapeHTML: s => s
      }, applications: {
        api: {
          DialogV2: {
            confirm
          }
        }
      }
    }
    const message = {
      data: {
        attackerUuid: 'Actor.hst', targetUuid: 'Actor.dek.Item.deck', count: 3
      }
    }
    expect(await _socketPlaceMarks(message, 'joueuse')).toBe(false)
    expect(confirm).toHaveBeenCalledOnce()
  })

  it('is game.sr5.matrix.placeMarks, its request handled by the active GM', () => {
    expect(typeof SR5MatrixApi.placeMarks).toBe('function')
    expect(read('../modules/hooks/init.js')).toMatch(/matrix: SR5MatrixApi/)
    expect(read('../modules/socket.js')).toMatch(/"apiPlaceMarks": \[async \(message, senderId\) => \(await import\("\.\/system\/matrix-api\.js"\)\)\._socketPlaceMarks/)
  })
})
