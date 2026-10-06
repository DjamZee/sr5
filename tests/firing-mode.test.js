import {
  describe, it, expect, vi
} from 'vitest'

// config.js writes CONFIG.statusEffects at import time
vi.hoisted(() => {
  globalThis.CONFIG ??= {
  }
})

import {
  SR5_MiscellaneousHelpers
} from '../modules/rolls/roll-helpers/miscellaneous.js'
import {
  SR5_ConverterHelpers
} from '../modules/rolls/roll-helpers/converter.js'

const fr = {
  "SR5.WeaponModeSSShort": "CC", "SR5.WeaponModeSAShort": "SA",
  "SR5.WeaponModeBFShort": "TR", "SR5.WeaponModeFAShort": "TA",
}
const localizeFr = key => fr[key] ?? key

describe('firingModeToCode', () => {
  const weapon = (modes, current = "") => ({
    singleShot: false, semiAutomatic: false, burstFire: false, fullyAutomatic: false, current, ...modes,
  })

  it('preselects the English code of the first enabled mode, whatever the language', () => {
    expect(SR5_ConverterHelpers.firingModeToCode(weapon({
      singleShot: true
    }), localizeFr)).toBe("SS")
    expect(SR5_ConverterHelpers.firingModeToCode(weapon({
      burstFire: true, fullyAutomatic: true
    }), localizeFr)).toBe("BF")
    expect(SR5_ConverterHelpers.firingModeToCode(weapon({
      fullyAutomatic: true
    }), localizeFr)).toBe("FA")
  })

  it('keeps a saved code', () => {
    expect(SR5_ConverterHelpers.firingModeToCode(weapon({
      semiAutomatic: true, burstFire: true
    }, "SB"), localizeFr)).toBe("SB")
  })

  it('turns a translated abbreviation saved by an earlier roll back into its code', () => {
    expect(SR5_ConverterHelpers.firingModeToCode(weapon({
      burstFire: true, fullyAutomatic: true
    }, "TA"), localizeFr)).toBe("FA")
    expect(SR5_ConverterHelpers.firingModeToCode(weapon({
      singleShot: true
    }, "CC"), localizeFr)).toBe("SS")
  })

  it('always yields a mode that converts to an action and to bullets', () => {
    const code = SR5_ConverterHelpers.firingModeToCode(weapon({
      burstFire: true
    }), localizeFr)
    expect(SR5_ConverterHelpers.firingModeToAction(code)).toBeTruthy()
    expect(SR5_ConverterHelpers.firingModeToBullet(code)).toBe(3)
  })
})

describe('firingModeChangeCost', () => {
  const fnHar = current => ({
    singleShot: true, semiAutomatic: true, burstFire: true, fullyAutomatic: true, current,
  })

  it('gives the action back when going back to the preselected mode, even if the saved mode is empty or translated', () => {
    // FN HAR saved as "" opens on SS; saved as "TA" opens on FA
    for (const [current, opened, other] of [["", "SS", "FA"], ["TA", "FA", "BF"], ["FA", "FA", "BF"]]) {
      expect(SR5_ConverterHelpers.firingModeChangeCost(fnHar(current), other, false, localizeFr), `${current} → ${other}`).toBe(1)
      expect(SR5_ConverterHelpers.firingModeChangeCost(fnHar(current), opened, true, localizeFr), `${current} → back to ${opened}`).toBe(-1)
    }
  })

  it('spends the action only once', () => {
    expect(SR5_ConverterHelpers.firingModeChangeCost(fnHar(""), "BF", true, localizeFr)).toBe(0)
    expect(SR5_ConverterHelpers.firingModeChangeCost(fnHar("TA"), "FA", false, localizeFr)).toBe(0)
  })
})

//M2-2, M2-3, M3 D2: changing the firing mode or the choke in the dialog joins the actions of the roll, spent
//when firing only (SR5 p. 166 and 182), and checked like them (no initiative left: warning)
describe('setChangeAction', () => {
  it('adds the change once, replaced on each new choice, and removes it when back to the saved setting', () => {
    let actions = SR5_MiscellaneousHelpers.addActions([], SR5_ConverterHelpers.rangedAttackAction("SA"))
    actions = SR5_MiscellaneousHelpers.setChangeAction(actions, "changeFiringMode", true, false)
    actions = SR5_MiscellaneousHelpers.setChangeAction(actions, "changeFiringMode", true, false)
    expect(actions).toEqual([{
      type: "simple", value: 1, source: "attack"
    }, {
      type: "simple", value: 1, source: "changeFiringMode"
    }])
    actions = SR5_MiscellaneousHelpers.setChangeAction(actions, "changeFiringMode", false, false)
    expect(actions).toEqual([{
      type: "simple", value: 1, source: "attack"
    }])
  })

  it('costs a free action with a wireless smartgun (SR5 p. 427, 435)', () => {
    expect(SR5_MiscellaneousHelpers.setChangeAction([], "changeChokeSettings", true, true)).toEqual([{
      type: "free", value: 1, source: "changeChokeSettings"
    }])
  })
})

describe('changeEndsRecoil (SR5 p. 178)', () => {
  it('a change spent as a simple action ends the recoil, not a free one, nor the shot alone', () => {
    expect(SR5_MiscellaneousHelpers.changeEndsRecoil(SR5_MiscellaneousHelpers.setChangeAction([], "changeFiringMode", true, false))).toBe(true)
    expect(SR5_MiscellaneousHelpers.changeEndsRecoil(SR5_MiscellaneousHelpers.setChangeAction([], "changeChokeSettings", true, true))).toBe(false)
    expect(SR5_MiscellaneousHelpers.changeEndsRecoil([SR5_ConverterHelpers.rangedAttackAction("SA")])).toBe(false)
  })
})

describe('addActions', () => {
  it('ignores an undefined action, so readers never meet action.type on undefined', () => {
    const actions = SR5_MiscellaneousHelpers.addActions([], SR5_ConverterHelpers.firingModeToAction("CC"))
    expect(actions).toEqual([])
    expect(actions.some(a => a.type === "simple" || a.type === "complex")).toBe(false)
  })

  it('counts a simple action for a ranged weapon with no firing mode (bow, thrown weapon)', () => {
    expect(SR5_ConverterHelpers.rangedAttackAction(undefined)).toEqual({
      type: "simple", value: 1, source: "attack"
    })
  })

  it('lets the dialog replace the default action by the mode of the weapon', () => {
    let actions = SR5_MiscellaneousHelpers.addActions([], SR5_ConverterHelpers.rangedAttackAction("SA"))
    actions = SR5_MiscellaneousHelpers.addActions(actions, SR5_ConverterHelpers.firingModeToAction("FAc"))
    expect(actions).toEqual([{
      type: "complex", value: 1, source: "attack"
    }])
  })

  it('still replaces the action of the same source', () => {
    let actions = SR5_MiscellaneousHelpers.addActions([], SR5_ConverterHelpers.firingModeToAction("SA"))
    actions = SR5_MiscellaneousHelpers.addActions(actions, undefined)
    actions = SR5_MiscellaneousHelpers.addActions(actions, SR5_ConverterHelpers.firingModeToAction("SB"))
    expect(actions).toEqual([{
      type: "complex", value: 1, source: "attack"
    }])
  })
})

describe('chokeToCode', () => {
  it('reads an unset choke as the narrow spread the weapon sheet shows (SR5 p. 182)', () => {
    expect(SR5_ConverterHelpers.chokeToCode({
      current: "", value: []
    })).toBe("narrow")
    expect(SR5_ConverterHelpers.chokeToCode(undefined)).toBe("narrow")
  })
  it('keeps a chosen spread', () => {
    expect(SR5_ConverterHelpers.chokeToCode({
      current: "wide"
    })).toBe("wide")
  })
})
