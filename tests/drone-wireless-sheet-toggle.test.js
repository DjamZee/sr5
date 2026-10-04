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

// N91: the deployed drone holds its wireless switch (N83), so its sheet carries the toggle.
// Switching a device is a free action through a DNI (SR5 p. 165), a simple one otherwise (p. 167),
// when the world setting asks for it. The drone spends the action; its owner's DNI decides.
const DEVICE = fs.readFileSync('templates/actors/_partials/left-tabs/matrixUser/device.hbs', 'utf8')
const DRONE_SHEET = fs.readFileSync('modules/entities/actors/droneSheet.js', 'utf8')

describe('wireless toggle on the drone sheet (N91)', () => {
  it('shows a wireless toggle on the drone sheet only', () => {
    const branch = DEVICE.match(/\{\{#if \(eq actor\.type 'actorDrone'\)\}\}([\s\S]*?)\{\{\/if\}\}\s*<\/div>\s*<\/li>/)
    expect(branch).not.toBeNull()
    expect(branch[1]).toContain('drone-wireless-toggle')
    expect(branch[1]).toContain('system.wirelessTurnedOn')
  })

  it('binds the toggle and spends the action on the drone', () => {
    expect(DRONE_SHEET).toMatch(/\.drone-wireless-toggle"[\s\S]*_onToggleDroneWireless/)
    expect(DRONE_SHEET).toContain('"system.wirelessTurnedOn": !oldValue')
    expect(DRONE_SHEET).toContain('SR5Combat.hasActionsLeft(actor, actions)')
  })

  it('costs a free action when the world does not ask for a DNI', () => {
    expect(SR5_ActorHelper.droneWirelessActionType(false, null)).toBe('free')
  })

  it("costs a free action through the owner's DNI, a simple one without", () => {
    expect(SR5_ActorHelper.droneWirelessActionType(true, {
      system: {
        hasDNI: true
      }
    })).toBe('free')
    expect(SR5_ActorHelper.droneWirelessActionType(true, {
      system: {
        hasDNI: false
      }
    })).toBe('simple')
    expect(SR5_ActorHelper.droneWirelessActionType(true, undefined)).toBe('simple')
  })
})
