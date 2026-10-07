import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import {
  answerPerception, _socketPerceptionRefused, refusalText
} from '../modules/canvas/pan-crown/pan-perception-card.js'
import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'
import {
  SR5_SocketHandler
} from '../modules/socket.js'
import {
  SR5_RollMessage
} from '../modules/rolls/roll-message.js'

// Anselmine, 07/10: a player added miscellaneous dice in the roll dialog of a Matrix Perception; the active gamemaster,
// who counts the card again, counted it on the sheet's pool and refused it without a word. The dice the card was rolled
// with count, and a true refusal is told to the player.

const dice = (...results) => JSON.stringify({
  terms: [{
    results: results.map(result => ({
      result, active: true
    }))
  }]
})

// The sheet: 4 dice of Matrix Perception, Edge 2; the card: 7 dice rolled (+3 miscellaneous), the 3 hits in the last
// three
const observer = {
  uuid: 'Actor.o', name: 'Decker', testUserPermission: () => true,
  system: {
    matrix: {
      actions: {
        matrixPerception: {
          test: {
            dicePool: 4
          }
        }
      }
    }, specialAttributes: {
      edge: {
        augmented: {
          value: 2
        }
      }
    }
  },
}
const playerCard = ({
  rolled = 7, hits = 3, r = dice(1, 2, 3, 4, 5, 6, 5)
} = {
}) => ({
  id: 'm1', byGM: false, roller: observer,
  data: {
    test: {
      type: 'matrixAction', typeSub: 'matrixPerception'
    }, target: {
      hasTarget: false
    },
    dicePool: {
      value: rolled
    }, limit: {
      value: 6
    }, roll: {
      hits, r
    }, edge: {
    },
  },
})
const player = {
  id: 'p1', name: 'Anselmine', isGM: false
}
const gm = {
  id: 'g1', name: 'MJ', isGM: true
}
const ask = (n) => ({
  messageId: 'm1', choices: [{
    key: 'silentNearby'
  }, {
    key: 'iconType'
  }, {
    key: 'grid'
  }].slice(0, n)
})

describe('a Matrix Perception card with dice added in the roll dialog', () => {
  it('counts its hits within the pool it was rolled with, not the sheet\'s alone', () => {
    const card = playerCard()
    expect(SR5_MiscellaneousHelpers.pushAwareHits(card, 'matrix.actions.matrixPerception.test.dicePool', 6)).toBe(0)
    expect(SR5_MiscellaneousHelpers.pushAwareHits(card, 'matrix.actions.matrixPerception.test.dicePool', 6, {
      rolled: true
    })).toBe(3)
  })

  it('never counts more than the dice it was rolled with', () => {
    // Says 4 dice rolled, shows 7: the three beyond do not count
    expect(SR5_MiscellaneousHelpers.pushAwareHits(playerCard({
      rolled: 4
    }), 'matrix.actions.matrixPerception.test.dicePool', 6, {
      rolled: true
    })).toBe(0)
  })
})

describe('the gamemaster\'s answer to a Matrix Perception', () => {
  let emit
  beforeEach(() => {
    globalThis.Hooks = {
      callAll: () => {}
    }
    foundry.utils.escapeHTML ??= s => String(s)
    globalThis.ChatMessage = {
      create: vi.fn(async () => ({
      }))
    }
    game.user = gm
    game.users = Object.assign([gm, player], {
      get: id => [gm, player].find(u => u.id === id)
    })
    vi.spyOn(SR5_MiscellaneousHelpers, 'isConsumed').mockReturnValue(false)
    vi.spyOn(SR5_MiscellaneousHelpers, 'consume').mockResolvedValue(true)
    vi.spyOn(SR5_RollMessage, 'updateChatButton').mockResolvedValue(true)
    emit = vi.spyOn(SR5_SocketHandler, 'emitForPlayer').mockResolvedValue()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers the honest card with +3 miscellaneous dice, without the gamemaster\'s window', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(playerCard())
    // Counted on the sheet's 4 dice, the card had 0 hits and this one piece of information was refused
    expect(await answerPerception(ask(1), player)).toBe(true)
    expect(emit).not.toHaveBeenCalled()
    expect(ChatMessage.create).toHaveBeenCalled()
  })

  it('refuses a true excess, and tells the player why with the hits counted', async () => {
    // The card shows 2 hits within its 7 dice, the player asks 3 pieces of information
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue({
      ...playerCard({
        hits: 2, r: dice(1, 2, 3, 4, 5, 6, 1)
      }), data: {
        ...playerCard().data, target: {
          hasTarget: true
        }, roll: {
          hits: 2, r: dice(1, 2, 3, 4, 5, 6, 1)
        }
      }
    })
    expect(await answerPerception(ask(3), player)).toBe(false)
    expect(emit).toHaveBeenCalledWith('matrixPerceptionRefused', {
      reason: 'tooMany', budget: 2
    }, 'p1')
    expect(ChatMessage.create).not.toHaveBeenCalled()
  })

  it('tells the player when the card cannot be read again', async () => {
    vi.spyOn(SR5_MiscellaneousHelpers, 'cardOf').mockReturnValue(null)
    expect(await answerPerception(ask(1), player)).toBe(false)
    expect(emit).toHaveBeenCalledWith('matrixPerceptionRefused', {
      reason: 'card', budget: null
    }, 'p1')
  })
})

describe('the refusal on the player\'s screen', () => {
  let warn
  beforeEach(() => {
    game.users = {
      get: id => ({
        g1: {
          isGM: true
        }, p2: {
          isGM: false
        }
      })[id]
    }
    warn = vi.spyOn(ui.notifications, 'warn')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows a gamemaster\'s refusal of a known reason', () => {
    _socketPerceptionRefused({
      data: {
        reason: 'tooMany', budget: 2
      }
    }, 'g1')
    expect(warn).toHaveBeenCalledWith(refusalText('tooMany', 2))
  })

  it('shows nothing a player sent, nor an unknown reason', () => {
    _socketPerceptionRefused({
      data: {
        reason: 'tooMany'
      }
    }, 'p2')
    _socketPerceptionRefused({
      data: {
        reason: '<b>texte libre</b>'
      }
    }, 'g1')
    expect(warn).not.toHaveBeenCalled()
  })
})
