import {
  describe, it, expect, vi
} from 'vitest'
import fs from 'node:fs'

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_ActorHelper
} = await import('../modules/entities/actors/entityActor-helpers.js')

// Turning a device's wireless off is a free action, with no DNI condition (SR5 p. 424, decided by DjamZ).
// Turning it on keeps p. 165 (free through a DNI) and p. 167 (simple otherwise), under the world setting.
const BASE_SHEET = fs.readFileSync('modules/entities/actors/baseSheet.js', 'utf8')
const DRONE_SHEET = fs.readFileSync('modules/entities/actors/droneSheet.js', 'utf8')

describe('wireless switch cost by direction', () => {
  it('turning off is free, even without a DNI under the setting', () => {
    expect(SR5_ActorHelper.wirelessSwitchActionType(false, true, false)).toBe('free')
    expect(SR5_ActorHelper.droneWirelessActionType(true, {
      system: {
        hasDNI: false
      }
    }, false)).toBe('free')
  })

  it('turning on without a DNI under the setting stays a simple action', () => {
    expect(SR5_ActorHelper.wirelessSwitchActionType(true, true, false)).toBe('simple')
    expect(SR5_ActorHelper.droneWirelessActionType(true, null, true)).toBe('simple')
  })

  it('turning on is free through a DNI, or when the setting is off', () => {
    expect(SR5_ActorHelper.wirelessSwitchActionType(true, true, true)).toBe('free')
    expect(SR5_ActorHelper.wirelessSwitchActionType(true, false, false)).toBe('free')
  })

  it('both sheets read the direction of the switch', () => {
    expect(BASE_SHEET.match(/wirelessSwitchActionType\(!oldValue, game\.settings\.get\("sr5", "sr5WifiRequiresDNI"\)/g)).toHaveLength(2)
    expect(DRONE_SHEET).toContain('game.settings.get("sr5", "sr5WifiRequiresDNI"), owner, !oldValue)')
  })
})
