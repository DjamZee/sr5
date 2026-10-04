import {
  describe, it, expect
} from 'vitest'
import {
  defenseActorId
} from '../modules/rolls/roll-helpers/cardRoller.js'

// N93: the GM clicking "Defend" with the attacker's token selected used to defend with the attacker,
// so the weapon break dialog listed the attacker's weapons
describe('defenseActorId', () => {
  const actors = {
    attackerToken: {
      uuid: "Scene.s.Token.attackerToken.Actor.a", isOwner: true
    },
    defender: {
      uuid: "Actor.defender", isOwner: true
    },
    other: {
      uuid: "Actor.other", isOwner: true
    },
  }
  const resolve = id => actors[id]
  const card = {
    owner: {
      speakerId: "attackerToken"
    }, target: {
      actorId: "defender"
    }
  }

  it('lets the card target defend when the attacker is selected', () => {
    expect(defenseActorId("attackerToken", card, resolve)).toBe("defender")
  })
  it('keeps the selected defender otherwise', () => {
    expect(defenseActorId("other", card, resolve)).toBe("other")
  })
  it('keeps the selection when the card has no target', () => {
    expect(defenseActorId("attackerToken", {
      owner: card.owner, target: {
      }
    }, resolve)).toBe("attackerToken")
  })
  it('keeps the selection when the user does not own the target', () => {
    expect(defenseActorId("attackerToken", card, id => id === "defender" ? {
      uuid: "Actor.defender", isOwner: false
    } : actors[id])).toBe("attackerToken")
  })
})
