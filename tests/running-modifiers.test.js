import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import {
  readFileSync
} from 'node:fs'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
  },
}))

const {
  runningModifierKind, runningModifierValue, sceneUnitsToMeters, runningGait, roundMeters, moveMakesRunning,
  registerRunningMovementActions, isRunning, onMoveToken, clearRunning, RUNNING_STATUS
} = await import('../modules/system/running.js')
const {
  default: SR5_RollDialog
} = await import('../modules/rolls/roll-dialog.js')
const {
  SR5_EntityHelpers
} = await import('../modules/entities/helpers.js')

const template = (name) => readFileSync(new URL(`../templates/rolls/rollDialogPartial/${name}`, import.meta.url), 'utf8')

describe('which tests take the running modifier (SR5 p. 164, 179, 190)', () => {
  it('a ranged attack uses the Attacker running box, a weapon defense the Defender running box', () => {
    expect(runningModifierKind({
      type: 'attack', typeSub: 'rangedWeapon'
    })).toBe('rangedAttack')
    expect(runningModifierKind({
      type: 'defense', typeSub: 'rangedWeapon'
    })).toBe('defenseBox')
    expect(runningModifierKind({
      type: 'defense', typeSub: 'meleeWeapon'
    })).toBe('defenseBox')
  })

  it('every other action takes -2: melee, spell, skill, perception, matrix action', () => {
    for (const test of [{
      type: 'attack', typeSub: 'meleeWeapon'
    }, {
      type: 'spell'
    }, {
      type: 'skill', typeSub: 'perception'
    },
    {
      type: 'skillDicePool'
    }, {
      type: 'matrixAction'
    }, {
      type: 'complexForm'
    }, {
      type: 'movement', typeSub: 'swim'
    }]) {
      expect(runningModifierKind(test)).toBe('general')
    }
    expect(runningModifierValue('general')).toBe(-2)
  })

  it('the other defense tests take +2', () => {
    expect(runningModifierKind({
      type: 'defenseSimple'
    })).toBe('defense')
    expect(runningModifierKind({
      type: 'martialArtDefense'
    })).toBe('defense')
    expect(runningModifierValue('defense')).toBe(2)
  })

  it('no modifier on Sprint (SR5 p. 164) nor on a resistance test (ruling of DjamZ)', () => {
    expect(runningModifierKind({
      type: 'movement', typeSub: 'run'
    })).toBe(null)
    for (const type of ['resistanceCard', 'drain', 'fading', 'spellResistance', 'weaponResistance']) {
      expect(runningModifierKind({
        type
      })).toBe(null)
    }
  })
})

describe('distances and gaits (SR5 p. 164)', () => {
  it('scene units become meters, a scene in feet included', () => {
    expect(sceneUnitsToMeters(1.5, 'm')).toBe(1.5)
    expect(sceneUnitsToMeters(10, 'ft')).toBeCloseTo(3.048)
    expect(sceneUnitsToMeters(10, '')).toBe(10)
  })

  it('walking up to Agility x 2, running up to Agility x 4, sprinting beyond', () => {
    //Agility 5: 10 m walking, 20 m running (example of Wombat)
    expect(runningGait(8, 10, 20)).toBe('walk')
    expect(runningGait(11, 10, 20)).toBe('run')
    expect(runningGait(21, 10, 20)).toBe('sprint')
  })

  it('the meters of another Combat Turn are not counted', () => {
    const flag = {
      combatId: 'c1', round: 2, meters: 8
    }
    expect(roundMeters(flag, 'c1', 2)).toBe(8)
    expect(roundMeters(flag, 'c1', 3)).toBe(0)
    expect(roundMeters(flag, 'c2', 2)).toBe(0)
  })

  it('the "Course" and "Sprint" actions run; the distance runs only if the world setting asks for it', () => {
    expect(moveMakesRunning('run', 1, 10, false)).toBe(true)
    expect(moveMakesRunning('sprint', 1, 10, false)).toBe(true)
    expect(moveMakesRunning('walk', 12, 10, false)).toBe(false)
    expect(moveMakesRunning('walk', 12, 10, true)).toBe(true)
    expect(moveMakesRunning('walk', 10, 10, true)).toBe(false)
  })

  it('"Course" and "Sprint" join the movement actions of the token HUD', () => {
    const movement = {
      actions: {
        walk: {
        }
      }
    }
    registerRunningMovementActions(movement)
    expect(movement.actions.run.label).toBe('SR5.MovementActionRun')
    expect(movement.actions.sprint.label).toBe('SR5.MovementActionSprint')
  })
})

describe('the running status follows the moves and the Combat Turns', () => {
  const actorWith = (statuses = []) => {
    const actor = {
      effects: statuses.map(s => ({
        statuses: new Set([s])
      })),
      system: {
        movements: {
          walk: {
            movement: {
              value: 10
            }
          }, run: {
            movement: {
              value: 20
            }
          }
        }
      },
      toggleStatusEffect: vi.fn(async (id, {
        active
      }) => {
        actor.effects = active ? [{
          statuses: new Set([id])
        }] : []
      })
    }
    return actor
  }
  const tokenWith = (actor, flag) => ({
    id: 't1', actor, movementAction: 'walk', parent: {
      grid: {
        units: 'm'
      }
    },
    flags: {
      sr5: {
        runDistance: flag
      }
    },
    getFlag(scope, key) { return this.flags[scope][key] },
    setFlag: vi.fn(async function (scope, key, value) { this.flags[scope][key] = value })
  })

  beforeEach(() => {
    globalThis.game.users = {
      activeGM: {
        isSelf: true
      }
    }
    globalThis.game.combat = {
      id: 'c1', round: 1, started: true, getCombatantByToken: () => ({
      })
    }
    globalThis.game.settings = {
      get: () => false
    }
  })

  it('a move with "Course" puts the status on', async () => {
    const actor = actorWith()
    await onMoveToken(tokenWith(actor), {
      passed: {
        distance: 3, waypoints: [{
          action: 'run'
        }]
      }
    })
    expect(actor.toggleStatusEffect).toHaveBeenCalledWith(RUNNING_STATUS, {
      active: true
    })
  })

  it('a walk beyond the walking rate puts it on only with the world setting', async () => {
    const actor = actorWith()
    const token = tokenWith(actor, {
      combatId: 'c1', round: 1, meters: 9
    })
    await onMoveToken(token, {
      passed: {
        distance: 3, waypoints: [{
          action: 'walk'
        }]
      }
    })
    expect(token.flags.sr5.runDistance.meters).toBe(12)
    expect(actor.toggleStatusEffect).not.toHaveBeenCalled()

    globalThis.game.settings = {
      get: () => true
    }
    await onMoveToken(token, {
      passed: {
        distance: 1.5, waypoints: [{
          action: 'walk'
        }]
      }
    })
    expect(actor.toggleStatusEffect).toHaveBeenCalledWith(RUNNING_STATUS, {
      active: true
    })
  })

  it('outside an encounter nothing is put on', async () => {
    globalThis.game.combat = null
    const actor = actorWith()
    await onMoveToken(tokenWith(actor), {
      passed: {
        distance: 30, waypoints: [{
          action: 'run'
        }]
      }
    })
    expect(actor.toggleStatusEffect).not.toHaveBeenCalled()
  })

  it('the status falls at the start of the next Combat Turn', async () => {
    const runner = actorWith([RUNNING_STATUS])
    await clearRunning({
      combatants: [{
        actor: runner
      }, {
        actor: actorWith()
      }]
    })
    expect(isRunning(runner)).toBe(false)
  })
})

describe('the roll dialog checks the running boxes of a runner', () => {
  //A tiny dialog: the boxes of the template, read by their data-modifier and their target input
  const fakeHtml = (modifiers) => {
    const boxes = {
      }, inputs = {
      }
    for (const m of modifiers) {
      boxes[m] = {
        checked: false, dataset: {
          modifier: m, target: `in-${m}`
        }
      }
      inputs[`in-${m}`] = {
        value: 0
      }
    }
    const roll = {
      innerHTML: ''
    }
    return {
      boxes, inputs,
      querySelector(sel) {
        if (sel === '[name="baseDicePool"]') return {
          value: '8'
        }
        if (sel === '[data-action="roll"]') return roll
        let m = sel.match(/^\[data-modifier=(\w+)\]$/)
        if (m) return boxes[m[1]]
        m = sel.match(/^\[name=([\w-]+)\]$/)
        if (m) return inputs[m[1]]
        return null
      }
    }
  }
  const dialogFor = (actor, running) => {
    vi.spyOn(SR5_EntityHelpers, 'getRealActorFromID').mockImplementation(id => (id === 'a1' ? actor : null))
    const dialogData = {
      owner: {
        actorId: 'a1'
      }, target: {
      }, dialogSwitch: {
        running
      }, dicePool: {
        modifiers: []
      }
    }
    return {
      dialog: new SR5_RollDialog(null, null, dialogData), dialogData
    }
  }

  beforeEach(() => {
    globalThis.game.settings = {
      get: () => false
    }
  })

  it('a runner casting a spell gets -2, defending gets +2', () => {
    const actor = {
      effects: [{
        statuses: new Set([RUNNING_STATUS])
      }]
    }
    let {
      dialog, dialogData
    } = dialogFor(actor, 'general')
    let html = fakeHtml(['running'])
    dialog._filledCheckBox(Object.values(html.boxes), html, dialogData)
    expect(html.boxes.running.checked).toBe(true)
    expect(dialogData.dicePool.modifiers).toEqual([expect.objectContaining({
      type: 'running', value: -2
    })])

    ;({
      dialog, dialogData
    } = dialogFor(actor, 'defense'))
    html = fakeHtml(['running', 'defenseRunning'])
    dialog._filledCheckBox(Object.values(html.boxes), html, dialogData)
    expect(dialogData.dicePool.modifiers.find(m => m.type === 'running').value).toBe(2)
  })

  it('the Attacker running and Defender running boxes are checked for a runner, not for a walker', () => {
    const runner = {
      effects: [{
        statuses: new Set([RUNNING_STATUS])
      }]
    }
    let {
      dialog, dialogData
    } = dialogFor(runner, false)
    let html = fakeHtml(['attackIsRunning', 'defenseRunning'])
    dialog._filledCheckBox(Object.values(html.boxes), html, dialogData)
    expect(dialogData.dicePool.modifiers.map(m => [m.type, m.value])).toEqual([['attackIsRunning', -2], ['defenseRunning', 2]])

    ;({
      dialog, dialogData
    } = dialogFor({
      effects: []
    }, false))
    html = fakeHtml(['attackIsRunning', 'defenseRunning'])
    dialog._filledCheckBox(Object.values(html.boxes), html, dialogData)
    expect(dialogData.dicePool.modifiers).toEqual([])
  })

  it('a charge takes the -2 of running off (SR5 p. 164 and 188)', () => {
    const actor = {
      effects: [{
        statuses: new Set([RUNNING_STATUS])
      }]
    }
    const {
      dialog, dialogData
    } = dialogFor(actor, 'general')
    const html = fakeHtml(['running', 'attackCharge'])
    //The running box already checked, as the dialog opens for a runner
    html.boxes.running.checked = true
    html.inputs['in-running'].value = -2
    dialogData.dicePool.modifiers.push({
      type: 'running', label: '', value: -2
    })
    html.boxes.attackCharge.checked = true
    dialog._checkboxModifier({
      target: html.boxes.attackCharge, currentTarget: html.boxes.attackCharge
    }, html, dialogData)
    expect(html.boxes.running.checked).toBe(false)
    expect(dialogData.dicePool.modifiers.map(m => [m.type, m.value])).toEqual([['attackCharge', 2]])
  })

  it('the templates show the running box and let the boxes be checked automatically', () => {
    expect(template('modifiers.hbs')).toContain('runningModifier.hbs')
    expect(template('runningModifier.hbs')).toMatch(/SR-ModCheckboxFilled[^>]*data-modifier="running"/)
    expect(template('attackRangedModifier.hbs')).toMatch(/SR-ModCheckboxFilled" data-target="dicePoolModAttackIsRunning"/)
    expect(template('defenseRangedModifiers.hbs')).toMatch(/SR-ModCheckboxFilled" data-target="dicePoolModDefenseRunning"/)
    expect(template('defenseMeleeModifier.hbs')).toMatch(/SR-ModCheckboxFilled" data-target="dicePoolModDefenseRunning"/)
  })
})
