import {
  describe, it, expect
} from 'vitest'
import {
  cardSpeakerId, ownsCardSpeaker
} from '../modules/rolls/roll-helpers/cardRoller.js'

// N95: the card of an unlinked token stores the token id, unknown to game.actors
const unlinkedNpc = {
  isOwner: true
}
const world = new Map([["linkedActor", {
  isOwner: true
}], ["othersActor", {
  isOwner: false
}]])
const tokens = new Map([["unlinkedToken", unlinkedNpc]])
const resolve = id => world.get(id) ?? tokens.get(id)

describe('cardSpeakerId', () => {
  it('takes the token first', () => {
    expect(cardSpeakerId({
      actor: "baseActor", token: "unlinkedToken"
    })).toBe("unlinkedToken")
  })
  it('falls back to the actor without token', () => {
    expect(cardSpeakerId({
      actor: "linkedActor", token: null
    })).toBe("linkedActor")
  })
})

describe('ownsCardSpeaker', () => {
  it('finds the player owning an unlinked token', () => {
    expect(ownsCardSpeaker({
      actor: "unlinkedToken", token: "unlinkedToken"
    }, resolve)).toBe(true)
  })
  it('finds the unlinked token of a full speaker', () => {
    expect(ownsCardSpeaker({
      scene: "scene", actor: "baseActor", token: "unlinkedToken"
    }, resolve)).toBe(true)
  })
  it('keeps the linked actor witness', () => {
    expect(ownsCardSpeaker({
      actor: "linkedActor", token: "linkedActor"
    }, resolve)).toBe(true)
  })
  it('refuses a card spoken by an actor the user does not own', () => {
    expect(ownsCardSpeaker({
      actor: "othersActor", token: null
    }, resolve)).toBe(false)
  })
  it('refuses a speaker that no longer exists', () => {
    expect(ownsCardSpeaker({
      actor: "gone", token: "gone"
    }, resolve)).toBe(false)
  })
  it('leaves a card without speaker alone', () => {
    expect(ownsCardSpeaker({
    }, resolve)).toBe(true)
  })
})
