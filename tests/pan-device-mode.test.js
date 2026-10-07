import {
  describe, it, expect
} from 'vitest'
import {
  deviceModeOf, hasDeviceMode, isMasterDevice, ownDeviceMode
} from '../modules/canvas/pan-crown/pan-device-mode.js'
import {
  modeSwitchCost
} from '../modules/canvas/pan-crown/pan-actions.js'

// The mode of a device as its sheets show it (couronne du PAN, lot 6): SR5 p. 236-237, and the silent mode a master
// passes on to its slaves (Kill Code p. 39, VO: "Slaved devices run silent when their master devices do").

let n = 0
function item(type, system = {
}){
  const id = `i${++n}`
  return {
    id, uuid: `Actor.x.Item.${id}`, type,
    system: {
      isWireless: true, wirelessTurnedOn: true, isSilent: false, isActive: false, ...system
    },
  }
}
function actor(items, runningSilent = false){
  return {
    id: 'pc', type: 'actorPc', items, system: {
      matrix: {
        runningSilent
      }
    }
  }
}
const commlink = (system = {
}) => item('itemDevice', {
  isActive: true, ...system
})

describe('hasDeviceMode', () => {
  it('shows a mode on the wireless items of the sheets', () => {
    for (const type of ['itemArmor', 'itemAugmentation', 'itemDevice', 'itemGear', 'itemVehicle', 'itemWeapon']) expect(hasDeviceMode(item(type))).toBe(true)
  })
  it('none on an item without wireless, a drug or a vintage weapon', () => {
    expect(hasDeviceMode(item('itemWeapon', {
      isWireless: false
    }))).toBe(false)
    expect(hasDeviceMode(item('itemDrug'))).toBe(false)
    expect(hasDeviceMode(item('itemWeapon', {
      accessory: [{
        name: 'vintage'
      }]
    }))).toBe(false)
  })
})

describe('deviceModeOf', () => {
  it('an unslaved device keeps its own mode', () => {
    expect(deviceModeOf(item('itemWeapon'))).toEqual({
      mode: 'active', silentFrom: null
    })
    expect(deviceModeOf(item('itemWeapon', {
      isSilent: true
    }))).toEqual({
      mode: 'silent', silentFrom: 'self'
    })
  })

  it('a slave runs silent when its master does (KC p. 39)', () => {
    const master = commlink()
    const owner = actor([master], true)
    const gun = item('itemWeapon', {
      isSlavedToPan: true, panMaster: 'pc'
    })
    expect(deviceModeOf(gun, {
      actor: owner, panOwner: owner
    })).toEqual({
      mode: 'silent', silentFrom: 'master'
    })
    // The master's silent box set on the item (an older switch) passes on too
    const quiet = actor([commlink({
      isSilent: true
    })])
    expect(deviceModeOf(gun, {
      panOwner: quiet
    }).silentFrom).toBe('master')
  })

  it('its own silent mode comes before its master\'s', () => {
    const owner = actor([commlink()], true)
    const gun = item('itemWeapon', {
      isSlavedToPan: true, isSilent: true
    })
    expect(deviceModeOf(gun, {
      panOwner: owner
    }).silentFrom).toBe('self')
  })

  it('offline comes first, whatever its silent box or its master', () => {
    const owner = actor([commlink()], true)
    const gun = item('itemWeapon', {
      isSlavedToPan: true, isSilent: true, wirelessTurnedOn: false
    })
    expect(deviceModeOf(gun, {
      panOwner: owner
    })).toEqual({
      mode: 'offline', silentFrom: null
    })
  })

  it('a master switched off or out of the Matrix passes nothing on', () => {
    const owner = actor([commlink({
      wirelessTurnedOn: false
    })], true)
    const gun = item('itemWeapon', {
      isSlavedToPan: true
    })
    expect(deviceModeOf(gun, {
      panOwner: owner
    }).mode).toBe('active')
    // Slaved to a PAN whose owner has no device in use
    expect(deviceModeOf(gun, {
      panOwner: actor([])
    }).mode).toBe('active')
  })

  it('the device in use runs silent with its user (SR5 p. 236)', () => {
    const deck = commlink()
    const owner = actor([deck], true)
    expect(isMasterDevice(deck)).toBe(true)
    expect(deviceModeOf(deck, {
      actor: owner
    })).toEqual({
      mode: 'silent', silentFrom: 'self'
    })
    expect(ownDeviceMode(deck, owner)).toBe('silent')
  })

  it('a deployed drone holds the switches of its vehicle', () => {
    const car = item('itemVehicle')
    const drone = {
      system: {
        wirelessTurnedOn: true, matrix: {
          runningSilent: true
        }
      }
    }
    expect(deviceModeOf(car, {
      drone
    }).mode).toBe('silent')
    expect(ownDeviceMode(car, null, drone)).toBe('silent')
  })
})

describe('the cost of a switch from the sheets (SR5 p. 236, Q7)', () => {
  const wireless = turningOn => turningOn ? 'simple' : 'free'
  it('running silent is a simple action, either way', () => {
    expect(modeSwitchCost('active', 'silent', wireless)).toEqual([{
      type: 'simple', value: 1, source: 'changeSilentMode'
    }])
    expect(modeSwitchCost('silent', 'active', wireless)).toEqual([{
      type: 'simple', value: 1, source: 'changeSilentMode'
    }])
  })
  it('the wireless keeps the cost of the sheet', () => {
    expect(modeSwitchCost('active', 'offline', wireless)).toEqual([{
      type: 'free', value: 1, source: 'turnOffWifi'
    }])
    expect(modeSwitchCost('offline', 'silent', wireless)).toEqual([{
      type: 'simple', value: 1, source: 'turnOnWifi'
    }, {
      type: 'simple', value: 1, source: 'changeSilentMode'
    }])
  })
})
