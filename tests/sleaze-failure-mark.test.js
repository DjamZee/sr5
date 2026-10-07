import {
  describe, it, expect
} from 'vitest'
import fs from 'node:fs'

import {
  markOutcome
} from '../modules/rolls/roll-helpers/socket-senders.js'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

// SR5 p. 232: "En cas d'action de Corruption ayant échoué, le programme Firewall de la cible détecte une intrusion et
// place immédiatement une mark sur le personnage" — one mark, whatever the attacker chose to put (review 43)
describe('A failed Sleaze action (SR5 p. 232)', () => {
  it('gives the defender one mark, even when the attacker tried for three', () => {
    expect(markOutcome({
      typeSub: 'hackOnTheFly', actionType: 'sleaze', attackerHits: 1, defenderHits: 3, chosen: 3
    })).toEqual({
      winner: 'defender', marks: 1, watchdog: false
    })
  })

  it('says one mark on its button, as the button puts', () => {
    const defense = read('../modules/rolls/roll-test-case/test-MatrixDefense.js')
    expect(defense).toMatch(/"defenderPlaceMark", `\$\{game\.i18n\.format\('SR5\.DefenderPlaceMarkTo', \{\s*key: 1, item: targetName/)
    const message = read('../modules/rolls/roll-message.js')
    expect(message).toMatch(/case "defenderPlaceMark": \{[\s\S]*?mark: 1,[\s\S]*?markItem\(markedID, attackerID, 1\)/)
  })
})
