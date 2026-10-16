import {
  describe, it, expect, vi, beforeEach
} from 'vitest'
import {
  resolveHostAttributes, hostTypeLayout, hostTypeOffsetLabel, untypedHostDefaults, lockedHostAttributes
} from '../modules/entities/actors/host-type.js'

// DjamZ, 17/10 : rien ne montrait que les attributs s'échangent ; la fiche met un cadenas sur ceux que le type fixe
describe('the padlocked attributes of a typed host', () => {
  it('a destination host: Data Processing is set by the type (KC p. 50)', () => {
    expect(lockedHostAttributes('destination')).toEqual({
      dataProcessing: true
    })
  })
  it('a data host, or no type: nothing is locked', () => {
    expect(lockedHostAttributes('data')).toEqual({
    })
    expect(lockedHostAttributes('')).toEqual({
    })
  })
})

vi.mock('../modules/socket.js', () => ({
  SR5_SocketHandler: {
    emitForGM: vi.fn(),
  },
}))

const {
  SR5_CharacterUtility
} = await import('../modules/entities/actors/utilityActor.js')

beforeEach(() => {
  globalThis.game = {
    ...globalThis.game,
    i18n: {
      localize: key => key,
      format: (key, data) => `${key}|${data.type}|${data.offset}`,
    },
  }
})

// [attack, sleaze, dataProcessing, firewall] of a host resolved from nothing saved (the default order)
const fresh = (type, rating) => {
  const v = resolveHostAttributes(type, rating).values
  return [v.attack, v.sleaze, v.dataProcessing, v.firewall]
}

describe("host types (Kill Code p. 48-52): the array of each type, by rating", () => {
  it("no type: nothing is computed, the attributes stay as entered", () => {
    expect(resolveHostAttributes("", 6)).toBeNull()
    expect(resolveHostAttributes(undefined, 6)).toBeNull()
    expect(hostTypeLayout("nested")).toBeNull()
  })

  it("data and industrial (p. 49): rating, +1, +2, +3, unchanged", () => {
    for (const type of ["data", "industrial"]) {
      expect(fresh(type, 1)).toEqual([1, 2, 3, 4])
      expect(fresh(type, 3)).toEqual([3, 4, 5, 6])
      expect(fresh(type, 6)).toEqual([6, 7, 8, 9])
      expect(fresh(type, 12)).toEqual([12, 13, 14, 15])
    }
  })

  it("destination (p. 50): Data Processing +3, then -2 / -3 / +2; what the book puts at 0 goes to 1", () => {
    expect(fresh("destination", 1)).toEqual([1, 1, 4, 3])
    expect(fresh("destination", 3)).toEqual([1, 1, 6, 5])
    expect(fresh("destination", 6)).toEqual([4, 3, 9, 8])
    expect(fresh("destination", 9)).toEqual([7, 6, 12, 11])
    expect(fresh("destination", 12)).toEqual([10, 9, 15, 14])
  })

  it("obsolete and offline (p. 52): Data Processing -3, Firewall -2, then +1 / +2; never below 1", () => {
    for (const type of ["obsolete", "offline"]) {
      expect(fresh(type, 1)).toEqual([3, 2, 1, 1])
      expect(fresh(type, 3)).toEqual([5, 4, 1, 1])
      expect(fresh(type, 6)).toEqual([8, 7, 3, 4])
      expect(fresh(type, 9)).toEqual([11, 10, 6, 7])
      expect(fresh(type, 12)).toEqual([14, 13, 9, 10])
    }
  })

  it("rogue (p. 52): rating to +3, the same sum", () => {
    expect(fresh("rogue", 3)).toEqual([3, 4, 5, 6])
    expect(fresh("rogue", 9)).toEqual([9, 10, 11, 12])
  })

  it("the collection offers only the free values, ascending", () => {
    expect(resolveHostAttributes("destination", 6).collection).toEqual([3, 4, 8])
    expect(resolveHostAttributes("obsolete", 6).collection).toEqual([7, 8])
    expect(resolveHostAttributes("data", 6).collection).toEqual([6, 7, 8, 9])
    expect(resolveHostAttributes("destination", 6).fixed).toEqual(["dataProcessing"])
    expect(resolveHostAttributes("offline", 6).fixed).toEqual(["dataProcessing", "firewall"])
  })
})

describe("host types: the gamemaster's arrangement of the free values", () => {
  it("a valid arrangement is kept (the Megapack's ready hosts)", () => {
    // Serveur industriel (indice 6): 7/6/9/8
    expect(resolveHostAttributes("industrial", 6, {
      attack: 7, sleaze: 6, dataProcessing: 9, firewall: 8
    }).values).toEqual({
      attack: 7, sleaze: 6, dataProcessing: 9, firewall: 8
    })
    // Serveur hors ligne (indice 3): 4/5/1/1
    const offline = resolveHostAttributes("offline", 3, {
      attack: 4, sleaze: 5, dataProcessing: 1, firewall: 1
    })
    expect(offline.values).toEqual({
      attack: 4, sleaze: 5, dataProcessing: 1, firewall: 1
    })
    expect(offline.reset).toBe(false)
    // Serveur de destination (indice 3): 1/1/6/5, two values brought up to 1
    expect(resolveHostAttributes("destination", 3, {
      attack: 1, sleaze: 1, dataProcessing: 6, firewall: 5
    }).reset).toBe(false)
  })

  it("the fixed attributes are always the type's, whatever was saved", () => {
    expect(resolveHostAttributes("destination", 6, {
      attack: 8, sleaze: 3, dataProcessing: 2, firewall: 4
    }).values).toEqual({
      attack: 8, sleaze: 3, dataProcessing: 9, firewall: 4
    })
  })

  it("an arrangement that no longer fits (another type, another rating) is dealt again in the default order", () => {
    const changed = resolveHostAttributes("destination", 6, {
      attack: 6, sleaze: 7, dataProcessing: 8, firewall: 9
    })
    expect(changed.reset).toBe(true)
    expect(changed.values).toEqual({
      attack: 4, sleaze: 3, dataProcessing: 9, firewall: 8
    })
    expect(resolveHostAttributes("data", 7, {
      attack: 6, sleaze: 7, dataProcessing: 8, firewall: 9
    }).reset).toBe(true)
  })

  it("rogue: up to 3 points moved, the sum the same; 4 points or another sum are dealt again", () => {
    expect(resolveHostAttributes("rogue", 6, {
      attack: 9, sleaze: 7, dataProcessing: 8, firewall: 6
    }).reset).toBe(false)
    // 6/7/8/9 -> 6/6/7/11: two points moved
    expect(resolveHostAttributes("rogue", 6, {
      attack: 11, sleaze: 6, dataProcessing: 7, firewall: 6
    }).reset).toBe(false)
    // 6/7/8/9 -> 5/6/7/12: three points moved
    expect(resolveHostAttributes("rogue", 6, {
      attack: 12, sleaze: 5, dataProcessing: 7, firewall: 6
    }).reset).toBe(false)
    // four points
    expect(resolveHostAttributes("rogue", 6, {
      attack: 13, sleaze: 5, dataProcessing: 6, firewall: 6
    }).reset).toBe(true)
    // another sum
    expect(resolveHostAttributes("rogue", 6, {
      attack: 9, sleaze: 9, dataProcessing: 8, firewall: 6
    }).reset).toBe(true)
  })

  it("an empty or zero value is never kept", () => {
    expect(resolveHostAttributes("data", 3, {
      attack: 0, sleaze: 0, dataProcessing: 0, firewall: 0
    }).reset).toBe(true)
  })

  it("the bubble's offset", () => {
    expect(hostTypeOffsetLabel(9, 6)).toBe("+3")
    expect(hostTypeOffsetLabel(4, 6)).toBe("-2")
    expect(hostTypeOffsetLabel(6, 6)).toBe("+0")
  })
})

/** The matrix of a prepared host, with the attributes it had saved */
function hostMatrix(hostType, deviceRating, [attack, sleaze, dataProcessing, firewall]) {
  const attribute = base => ({
    base, modifiers: [], value: 0
  })
  return {
    hostType, deviceRating,
    attributesCollection: {
      value1: deviceRating, value2: deviceRating + 1, value3: deviceRating + 2, value4: deviceRating + 3,
      value1isSet: false, value2isSet: false, value3isSet: false, value4isSet: false,
    },
    attributes: {
      attack: attribute(attack), sleaze: attribute(sleaze), dataProcessing: attribute(dataProcessing), firewall: attribute(firewall),
    },
  }
}

describe("applyHostType: the host's preparation", () => {
  it("no type: the saved attributes and the usual collection are left alone", () => {
    const matrix = hostMatrix("", 6, [6, 9, 7, 8])
    SR5_CharacterUtility.applyHostType(matrix)
    expect(matrix.attributes.sleaze.base).toBe(9)
    expect(matrix.attributes.sleaze.modifiers).toEqual([])
    expect(matrix.attributesCollection.value4).toBe(9)
    expect(matrix.attributesCollection.value1isSet).toBe(false)
  })

  it("a data host of rating 6 and an obsolete one of rating 9, as Kill Code gives them", () => {
    const data = hostMatrix("data", 6, [0, 0, 0, 0])
    SR5_CharacterUtility.applyHostType(data)
    expect(HOST(data)).toEqual([6, 7, 8, 9])
    const obsolete = hostMatrix("obsolete", 9, [0, 0, 0, 0])
    SR5_CharacterUtility.applyHostType(obsolete)
    expect(HOST(obsolete)).toEqual([11, 10, 6, 7])
  })

  it("the collection offers the free values, all dealt; the unused slots are empty", () => {
    const matrix = hostMatrix("obsolete", 6, [0, 0, 0, 0])
    SR5_CharacterUtility.applyHostType(matrix)
    expect([1, 2, 3, 4].map(i => matrix.attributesCollection[`value${i}`])).toEqual([7, 8, 0, 0])
    expect([1, 2, 3, 4].every(i => matrix.attributesCollection[`value${i}isSet`])).toBe(true)
  })

  it("each attribute gets a line in its bubble, fixed or dealt by the type, with no effect on the total", () => {
    const matrix = hostMatrix("destination", 6, [0, 0, 0, 0])
    SR5_CharacterUtility.applyHostType(matrix)
    const line = matrix.attributes.dataProcessing.modifiers[0]
    expect(line.type).toBe("hostType")
    expect(line.value).toBe(0)
    expect(line.source).toBe("SR5.HostTypeFixed|SR5.HostTypeDestination (KC p. 50)|+3")
    expect(matrix.attributes.sleaze.modifiers[0].source).toBe("SR5.HostTypeDealt|SR5.HostTypeDestination (KC p. 50)|-3")
  })

  it("no type, never arranged: the default order of SR5 p. 248, not four attributes at 0 (Valentine, 07/10)", () => {
    const matrix = hostMatrix("", 5, [0, 0, 0, 0])
    SR5_CharacterUtility.applyHostType(matrix)
    expect(HOST(matrix)).toEqual([5, 6, 7, 8])
    expect([1, 2, 3, 4].every(i => matrix.attributesCollection[`value${i}isSet`])).toBe(true)
    expect(matrix.attributes.firewall.modifiers[0].type).toBe("hostType")
    expect(matrix.attributes.firewall.modifiers[0].value).toBe(0)
  })

  it("no type, partly arranged by the gamemaster: left as entered", () => {
    const placed = hostMatrix("", 5, [7, 0, 0, 0])
    SR5_CharacterUtility.applyHostType(placed)
    expect(HOST(placed)).toEqual([7, 0, 0, 0])
    const flagged = hostMatrix("", 5, [0, 0, 0, 0])
    flagged.attributesCollection.value2isSet = true
    SR5_CharacterUtility.applyHostType(flagged)
    expect(HOST(flagged)).toEqual([0, 0, 0, 0])
  })

  it("untypedHostDefaults", () => {
    expect(untypedHostDefaults(4)).toEqual({
      attack: 4, sleaze: 5, dataProcessing: 6, firewall: 7
    })
    expect(untypedHostDefaults(4, {
      firewall: 6
    })).toBeNull()
    expect(untypedHostDefaults(4, {
    }, true)).toBeNull()
  })

  it("changing the type changes the attributes", () => {
    const matrix = hostMatrix("data", 6, [6, 7, 8, 9])
    SR5_CharacterUtility.applyHostType(matrix)
    expect(HOST(matrix)).toEqual([6, 7, 8, 9])
    const changed = hostMatrix("destination", 6, [6, 7, 8, 9])
    SR5_CharacterUtility.applyHostType(changed)
    expect(HOST(changed)).toEqual([4, 3, 9, 8])
  })
})

function HOST(matrix) {
  return ["attack", "sleaze", "dataProcessing", "firewall"].map(key => matrix.attributes[key].base)
}
