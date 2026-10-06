import {
  describe, it, expect
} from 'vitest'
import {
  readFileSync
} from 'node:fs'
import {
  matrixDefenseActorId
} from '../modules/rolls/roll-helpers/cardRoller.js'

// Anatole's matrix trial: "Defend" with the attacker still selected offered the attacker's deck
describe('matrixDefenseActorId', () => {
  const actors = {
    attacker: {
      uuid: "Actor.attacker", isOwner: true
    },
    attackerToken: {
      uuid: "Actor.attacker", isOwner: true
    },
    defender: {
      uuid: "Actor.defender", isOwner: true
    },
    foreign: {
      uuid: "Actor.foreign", isOwner: false
    },
    other: {
      uuid: "Actor.other", isOwner: true
    },
  }
  const resolve = id => actors[id]
  const card = target => ({
    owner: {
      speakerId: "attacker"
    },
    target: {
      actorId: target
    },
  })

  it('takes the target, even with the attacker selected', () => {
    expect(matrixDefenseActorId("attackerToken", card("defender"), resolve)).toBe("defender")
  })
  it('takes the target with nothing selected', () => {
    expect(matrixDefenseActorId(undefined, card("defender"), resolve)).toBe("defender")
  })
  it('falls back to the selected one when the target is not owned', () => {
    expect(matrixDefenseActorId("other", card("foreign"), resolve)).toBe("other")
  })
  it('refuses the attacker when nobody else may defend', () => {
    expect(matrixDefenseActorId("attackerToken", card("foreign"), resolve)).toBeNull()
    expect(matrixDefenseActorId("attackerToken", card(undefined), resolve)).toBeNull()
    expect(matrixDefenseActorId(undefined, card(undefined), resolve)).toBeNull()
  })
  it('never takes the attacker as target either', () => {
    expect(matrixDefenseActorId(undefined, card("attacker"), resolve)).toBeNull()
  })
})

describe('Matrix defense wiring', () => {
  const source = readFileSync(new URL('../modules/rolls/roll-message.js', import.meta.url), 'utf8')
  it('picks the matrix defender before the "no actor" refusal, and refuses when there is none', () => {
    const pick = source.indexOf('matrixDefenseActorId(opposedTestActorId(speaker)')
    expect(pick).toBeGreaterThan(-1)
    expect(pick).toBeLessThan(source.indexOf('if (actor == null && !supportAction'))
    expect(source.slice(pick, pick + 400)).toMatch(/SR5\.WARN_NoMatrixDefender/)
  })
})

describe('Maglock type block', () => {
  const template = readFileSync(new URL('../templates/actors/_partials/left-tabs/matrixUser/maglockType.hbs', import.meta.url), 'utf8')
  it('is shown on a maglock only, not on a host', () => {
    expect(template).toMatch(/^\{\{!--[^\n]*\n\{\{#if \(eq system\.matrix\.deviceType "maglock"\)\}\}/)
    expect(template.trimEnd().endsWith('{{/if}}')).toBe(true)
  })
})

describe('Matrix damage written nowhere', () => {
  const source = readFileSync(new URL('../modules/rolls/roll-helpers/matrix.js', import.meta.url), 'utf8')
  it('tells the GM when no device nor living persona takes the damage', () => {
    const block = source.match(/if \(!targetItem\) \{([\s\S]*?)\n {4}\}/)[1]
    expect(block).toMatch(/SR5\.WARN_MatrixDamageNowhere/)
    expect(block).toMatch(/getWhisperRecipients\("GM"\)/)
    expect(block).toMatch(/escapeHTML/)
  })
  it('has the message in both languages', () => {
    for (const lang of ["en", "fr"]) {
      const json = JSON.parse(readFileSync(new URL(`../lang/${lang}.json`, import.meta.url), 'utf8'))
      expect(json["SR5.WARN_MatrixDamageNowhere"]).toMatch(/\{name\}[\s\S]*\{value\}/)
      expect(json["SR5.WARN_NoMatrixDefender"]).toBeTruthy()
    }
  })
})
