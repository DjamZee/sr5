import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import fs from 'node:fs'

import {
  MAX_MARKS, markCount, markTarget, markable, actorRef, placeMarks, _socketPlaceMarks, SR5MatrixApi,
  CONVERGENCE_DAMAGE, HOST_CONVERGENCE_MARKS, convergencePlan, converge, convergenceLines,
  MATRIX_ACTION_RESOLVED_HOOK, matrixActionPayload, announceMatrixAction
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
    //A host marks with no scene viewed (measured on 30003): its tokens are looked for on the canvas only when there is one
    expect(read('../modules/rolls/roll-helpers/mark.js')).not.toMatch(/canvas\.tokens\.placeables/)
    expect(read('../modules/socket.js')).toMatch(/"apiPlaceMarks": \[async \(message, senderId\) => \(await import\("\.\/system\/matrix-api\.js"\)\)\._socketPlaceMarks/)
  })
})

describe('A12: the convergence (game.sr5.matrix.converge)', () => {
  it('on the grid: DV 12 resisted, a forced reboot, the location told unless Sneak runs (SR5 p. 233, 247)', () => {
    expect(CONVERGENCE_DAMAGE).toBe(12)
    expect(convergencePlan()).toEqual({
      damage: 12, reboot: true, marks: 0, located: true
    })
    expect(convergencePlan({
      stealth: true
    })).toEqual({
      damage: 12, reboot: true, marks: 0, located: false
    })
  })

  it('in a host: neither damage nor reboot, the host puts three marks (SR5 p. 249)', () => {
    expect(HOST_CONVERGENCE_MARKS).toBe(3)
    expect(convergencePlan({
      inHost: true
    })).toEqual({
      damage: 0, reboot: false, marks: 3, located: false
    })
  })

  it('in a host, whispers the marks put only when they were (review 43: a sprite, a persona offline carry none)', () => {
    const plan = convergencePlan({
      inHost: true
    })
    expect(convergenceLines({
      name: 'Dek', host: 'Ares', plan, placed: true
    })).toEqual([['SR5.MatrixConvergenceHost', {
      name: 'Dek', host: 'Ares', marks: 3
    }]])
    expect(convergenceLines({
      name: 'Spr', host: 'Ares', plan, placed: false, sprite: true
    })).toEqual([['SR5.MatrixConvergenceHostNoMark', {
      name: 'Spr', host: 'Ares', marks: 3
    }], ['SR5.MatrixConvergenceSprite']])
    const source = read('../modules/system/matrix-api.js')
    expect(source).toMatch(/const placed = plan\.marks \? await placeMarks\([^)]*\{\s*source: "convergence"\s*\}\) === true : false/)
    expect(source).toMatch(/whisperConvergence\(actor, hostActor, plan, placed\)/)
  })

  it('on the grid, whispers the damage and the location as before', () => {
    expect(convergenceLines({
      name: 'Dek', plan: convergencePlan({
        stealth: true
      })
    })).toEqual([['SR5.MatrixConvergenceGrid', {
      name: 'Dek', damage: 12
    }], ['SR5.MatrixConvergenceStealth']])
  })

  it('on the GM\'s browser, converges on the persona, in its host when one is named', async () => {
    const {
      decker, host
    } = world()
    const h = helpers()
    expect(await converge(decker, {
    }, h)).toBe(true)
    expect(h.converge).toHaveBeenLastCalledWith(decker, null)
    expect(await converge('Actor.dek', {
      host: 'Actor.hst'
    }, h)).toBe(true)
    expect(h.converge).toHaveBeenLastCalledWith(decker, host)
  })

  it('does nothing without a persona, or with a host it cannot find', async () => {
    const {
      decker
    } = world()
    const h = helpers()
    expect(await converge(null, {
    }, h)).toBe(false)
    expect(await converge(decker, {
      host: 'Actor.none'
    }, h)).toBe(false)
    expect(h.converge).not.toHaveBeenCalled()
  })

  it('on a player\'s browser, asks the active GM', async () => {
    const {
      decker
    } = world()
    game.user.isGM = false
    const h = helpers()
    expect(await converge(decker, {
      host: 'Actor.hst'
    }, h)).toBe('relayed')
    expect(h.converge).not.toHaveBeenCalled()
    expect(h.emitForGM).toHaveBeenCalledWith('apiConverge', {
      personaUuid: 'Actor.dek', hostUuid: 'Actor.hst'
    })
  })

  it('reuses the system\'s reboot, matrix resistance card and marks, and is game.sr5.matrix.converge', () => {
    const source = read('../modules/system/matrix-api.js')
    expect(source).toMatch(/actor\.rebootDeck\(\)/)
    expect(source).toMatch(/generateChatButton\("nonOpposedTest", "matrixResistance"/)
    expect(source).toMatch(/placeMarks\(hostActor, actor, plan\.marks/)
    expect(source).toMatch(/programs\?\.sneak\?\.isActive/)
    //One dumpshock: the reboot's; a deck its damage bricks deals none again
    expect(source).toMatch(/rollData\.damage\.convergence = true/)
    expect(read('../modules/rolls/roll-prepare-case/rollData-MatrixResistance.js')).toMatch(/if \(chatData\.damage\.convergence\) rollData\.damage\.convergence = true/)
    expect(read('../modules/rolls/roll-helpers/matrix.js')).toMatch(/!relayed && !cardData\.damage\?\.convergence && targetItem\.type === "itemDevice"/)
    expect(read('../modules/rolls/roll-helpers/miscellaneous.js')).toMatch(/!SR5_MiscellaneousHelpers\.cardOf\(data\.messageId\)\?\.data\?\.damage\?\.convergence/)
    expect(typeof SR5MatrixApi.converge).toBe('function')
    expect(read('../modules/socket.js')).toMatch(/"apiConverge": \[async \(message, senderId\) => \(await import\("\.\/system\/matrix-api\.js"\)\)\._socketConverge/)
  })
})

describe('A5: the hook after a matrix action resolved (sr5.matrixActionResolved)', () => {
  beforeEach(() => {
    globalThis.foundry = {
      utils: {
        deepClone: value => structuredClone(value)
      }
    }
  })
  const card = () => ({
    test: {
      typeSub: 'hackOnTheFly'
    }, target: {
      itemUuid: 'Actor.cam.Item.dev'
    }, matrix: {
      mark: 2
    }
  })

  it('carries the actor, the action, the target, the hits, the net hits and the marks', () => {
    const actor = {
      name: 'Decker'
    }, target = {
      name: 'Caméra'
    }
    expect(matrixActionPayload({
      actor, card: card(), target, successes: 5, netHits: 2, marksPlaced: 2
    })).toMatchObject({
      actor, key: 'hackOnTheFly', target, successes: 5, netHits: 2, marksPlaced: 2, defenderMarks: 0,
      itemUuid: 'Actor.cam.Item.dev', refreshed: false,
    })
  })

  it('gives the subscriber a copy: what it changes stays out of the card', () => {
    const data = card()
    const seen = []
    announceMatrixAction({
      actor: {
      }, card: data, successes: 3, netHits: 1
    }, (hook, payload) => {
      seen.push(hook)
      payload.card.matrix.mark = 3
      payload.card.test.typeSub = 'bruteForce'
    })
    expect(seen).toEqual([MATRIX_ACTION_RESOLVED_HOOK])
    expect(MATRIX_ACTION_RESOLVED_HOOK).toBe('sr5.matrixActionResolved')
    expect(data.matrix.mark).toBe(2)
    expect(data.test.typeSub).toBe('hackOnTheFly')
  })

  it('says refreshed when the same card is resolved again (Second Chance, Push the Limit)', () => {
    const data = card(), payloads = []
    const call = (hook, payload) => payloads.push(payload)
    announceMatrixAction({
      actor: {
      }, card: data, successes: 3, netHits: 1
    }, call)
    announceMatrixAction({
      actor: {
      }, card: structuredClone(data), successes: 4, netHits: 2
    }, call)
    expect(payloads.map(p => p.refreshed)).toEqual([false, true])
  })

  it('is called where the system resolves a matrix action: the defense card, or the action card no defense opposes', () => {
    const defense = read('../modules/rolls/roll-test-case/test-MatrixDefense.js')
    expect(defense).toMatch(/announceMatrixAction\(\{\s*actor: attacker, card: cardData, target: actor, successes: cardData\.previousMessage\.hits, netHits,/)
    expect(defense).toMatch(/MARKING_ACTIONS = \["hackOnTheFly", "bruteForce", "watchdog"\]/)
    const action = read('../modules/rolls/roll-test-case/test-MatrixAction.js')
    expect(action.match(/resolved\(/g).length).toBeGreaterThanOrEqual(8)
    expect(action).toMatch(/RESOLVED_ON_HITS = \["jamSignals", "iAmTheFirewall", "intervene"\]/)
  })
})
