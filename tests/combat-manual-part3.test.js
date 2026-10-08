import {
  describe, it, expect, vi
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_EntityHelpers
} from '../modules/entities/helpers.js'
import {
  matrixDefenseActorId
} from '../modules/rolls/roll-helpers/cardRoller.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// Three defects of the combat seen while writing part 3 of the manual (Marceau)
describe('the clinch defense goes to the card\'s target (Run & Gun p. 133)', () => {
  const actors = {
    attacker: {
      uuid: 'Actor.attacker', isOwner: true
    },
    clinched: {
      uuid: 'Actor.clinched', isOwner: true
    },
  }
  const resolve = id => actors[id]
  const card = {
    owner: {
      speakerId: 'attacker'
    }, target: {
      actorId: 'clinched'
    }
  }

  it('takes the target with the attacker still selected, or nothing selected', () => {
    expect(matrixDefenseActorId('attacker', card, resolve)).toBe('clinched')
    expect(matrixDefenseActorId(undefined, card, resolve)).toBe('clinched')
  })

  it('refuses the attacker when the card has no target', () => {
    expect(matrixDefenseActorId('attacker', {
      owner: card.owner, target: {
      }
    }, resolve)).toBeNull()
  })

  it('picks the defender before the "no actor" refusal, with a message of its own in both languages', () => {
    const source = read('../modules/rolls/roll-message.js')
    const pick = source.indexOf('if (type === "grappleClinchDefense")')
    expect(pick).toBeGreaterThan(-1)
    expect(pick).toBeLessThan(source.indexOf('if (actor == null && !supportAction'))
    expect(source.slice(pick, pick + 400)).toContain('SR5.WARN_NoClinchDefender')
    for (const lang of ['fr', 'en']) expect(JSON.parse(read(`../lang/${lang}.json`))['SR5.WARN_NoClinchDefender']).toBeTruthy()
  })
})

describe('an unlinked token is named after its token', () => {
  it('displayName: the token\'s name for a synthetic actor, the actor\'s otherwise', () => {
    expect(SR5_EntityHelpers.displayName({
      name: 'Pro 2 - Sécurité corporatiste', isToken: true, token: {
        name: 'Garde B'
      }
    })).toBe('Garde B')
    expect(SR5_EntityHelpers.displayName({
      name: 'Dodger', isToken: false
    })).toBe('Dodger')
    expect(SR5_EntityHelpers.displayName(null)).toBe('')
  })

  it('the damage, prone and hold notifications use it', () => {
    const helpers = read('../modules/entities/actors/entityActor-helpers.js')
    expect(helpers).not.toMatch(/\$\{(realActor|actor)\.name\}\$\{game\.i18n\.localize\("SR5\.Colons"\)\}/)
    expect(helpers).toContain('${SR5_EntityHelpers.displayName(actor)} ${game.i18n.format("SR5.INFO_DropProne")}')
    const grapple = read('../modules/rolls/roll-helpers/grapple.js')
    expect(grapple).toContain('holder: SR5_EntityHelpers.displayName(holder), held: SR5_EntityHelpers.displayName(held), hold')
    expect(grapple).toContain('alias: SR5_EntityHelpers.displayName(holder)')
    // ... and the actions spent or missing
    expect(read('../modules/system/srcombat.js')).not.toContain('actor: actor.name,')
  })
})

describe('a missing action spent with the lock lifted is not announced as refused', () => {
  it('the gamemaster is told the lifted wording, in both languages', () => {
    expect(read('../modules/system/srcombat.js')).toContain('liftedKey: "SR5.RULELOCKS_NoActionLeftLifted"')
    for (const lang of ['fr', 'en']) {
      const text = JSON.parse(read(`../lang/${lang}.json`))['SR5.RULELOCKS_NoActionLeftLifted']
      expect(text).toContain('{actor}')
      expect(text).not.toMatch(/rien n'est dépensé|nothing is spent/)
    }
  })
})
