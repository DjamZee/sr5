import {
  describe, it, expect, vi
} from 'vitest'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

// N95: the actors the card owner id can resolve to
const unlinkedToken = {
  id: "unlinkedToken"
}
const actors = {
  unlinkedToken: {
    id: "baseActor", token: unlinkedToken
  },
  linkedActor: {
    id: "linkedActor", token: null
  },
}
vi.mock('../modules/entities/helpers.js', async (importOriginal) => {
  const original = await importOriginal()
  original.SR5_EntityHelpers.getRealActorFromID = id => actors[id]
  return original
})

// Stand-in for Foundry's ChatMessage.getSpeaker: it builds the speaker from the actor and its token
globalThis.ChatMessage = {
  getSpeaker: ({
    actor, token
  }) => ({
    scene: "scene", actor: actor.id, token: token?.id ?? null, alias: "Foundry alias"
  }),
}

const {
  SR5_RollTest
} = await import('../modules/rolls/roll-test.js')

describe('SR5_RollTest.cardSpeaker', () => {
  it('stores the scene, the token and the world actor of an unlinked token', () => {
    expect(SR5_RollTest.cardSpeaker({
      speakerId: "unlinkedToken", speakerActor: "PNJ"
    })).toEqual({
      scene: "scene", actor: "baseActor", token: "unlinkedToken", alias: "PNJ"
    })
  })
  it('keeps the world actor of a linked actor', () => {
    expect(SR5_RollTest.cardSpeaker({
      speakerId: "linkedActor", speakerActor: "PJ"
    })).toEqual({
      scene: "scene", actor: "linkedActor", token: null, alias: "PJ"
    })
  })
  it('falls back to the bare id when the actor cannot be found', () => {
    expect(SR5_RollTest.cardSpeaker({
      speakerId: "gone", speakerActor: "Disparu"
    })).toEqual({
      actor: "gone", token: "gone", alias: "Disparu"
    })
  })
})
