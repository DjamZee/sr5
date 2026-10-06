import {
  describe, it, expect, vi, beforeEach
} from 'vitest'

//Pauline's remainder c: the Apply button of a card went away as soon as it was clicked, even when the GM then said no
//(or the card was rejected): nothing applied, and nothing left to apply it with
vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_RollMessage
} = await import('../modules/rolls/roll-message.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

let target, updated
function clickApply(type = 'applyEffect') {
  game.messages = new Map([['m1', {
    flags: {
      sr5data: {
        owner: {
          speakerId: 'mage', actorId: 'mage', itemUuid: 'Actor.mage.Item.spell'
        },
        previousMessage: {
        }, target: {
          hasTarget: false
        }, test: {
          type: 'spell'
        },
        magic: {
          spell: {
            area: 0
          }
        },
      }
    }
  }]])
  const button = {
    dataset: {
      action: 'opposedTest', type
    },
    closest: () => ({
      dataset: {
        messageId: 'm1'
      }
    }),
  }
  return SR5_RollMessage.chatButtonAction({
    preventDefault: () => {}, currentTarget: button
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  game.user = {
    isGM: true, targets: new Set()
  }
  globalThis.ChatMessage = {
    getSpeaker: () => ({
      token: 'target'
    })
  }
  globalThis.fromUuid = async () => ({
    system: {
      customEffects: {
      }
    }
  })
  target = {
    id: 'target', applyExternalEffect: vi.fn()
  }
  vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => id === 'target' ? target : null)
  updated = vi.spyOn(SR5_RollMessage, 'updateChatButtonHelper').mockResolvedValue()
})

describe('the Apply button of a card', () => {
  it('stays when the GM declines, or the card is rejected', async () => {
    target.applyExternalEffect.mockResolvedValue(false)
    await clickApply()
    await clickApply('applyEffectOnItem')
    expect(target.applyExternalEffect).toHaveBeenCalledTimes(2)
    expect(updated).not.toHaveBeenCalled()
  })

  it('goes once the effect is applied', async () => {
    target.applyExternalEffect.mockResolvedValue(true)
    await clickApply()
    expect(updated).toHaveBeenCalledWith('m1', 'applyEffect')
  })

  it('applies once while the GM decides, however many clicks', async () => {
    let answer
    target.applyExternalEffect.mockImplementation(() => new Promise(r => {
      answer = r
    }))
    const first = clickApply()
    await new Promise(r => setTimeout(r, 0))
    await clickApply()
    answer(true)
    await first
    expect(target.applyExternalEffect).toHaveBeenCalledTimes(1)
    expect(updated).toHaveBeenCalledTimes(1)
  })
})
