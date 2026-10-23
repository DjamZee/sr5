import {
  describe, it, expect, beforeAll, afterEach
} from 'vitest'
import {
  isDefaultActorImage, defaultIceImages, defaultSpriteImages, contactImageCandidates, defaultContactImages,
  seededRandom,
  imageChanges, defaultImageOnCreate, defaultImageOnUpdate, ICE_IMAGE_DIR, SPRITE_IMAGE_DIR, CONTACT_IMAGE_DIR,
  isDefaultContactPortrait, contactItemOf
} from '../modules/entities/actors/default-actor-images.js'
import {
  CONTACT_IMAGES
} from '../modules/entities/actors/contact-images-list.js'
import {
  SPIRIT_IMAGE_TYPES, defaultSpiritImages
} from '../modules/entities/actors/spirit-default-image.js'
import {
  existsSync, readFileSync
} from 'node:fs'

const DEVICE = 'systems/sr5/assets/img/actors/actorDevice.svg'
const GRUNT = 'systems/sr5/assets/img/actors/actorGrunt.svg'
const LIST = [
  {
    file: 'barman-ork-femme.webp', job: 'barman', metatype: 'ork', gender: 'female', token: 'barman-ork-femme-token.webp'
  },
  {
    file: 'barman-elfe-homme.webp', job: 'barman', metatype: 'elf', gender: 'male'
  },
  {
    file: 'street-doc-humain-femme.webp', job: 'street doc', metatype: 'human', gender: 'female'
  },
  {
    file: 'ganger-ork-homme.webp', job: 'ganger', metatype: 'ork', gender: 'male'
  },
  {
    file: 'damian-welsch-fixer.webp', job: 'fixer', metatype: '', gender: '', named: true
  },
]

beforeAll(() => {
  const flat = (o, p = '', out = {
  }) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, `${p}${k}.`, out)
      else out[`${p}${k}`] = v
    }
    return out
  }
  foundry.utils.flattenObject ??= (o) => flat(o)
  foundry.utils.expandObject ??= (o) => {
    const out = {
    }
    for (const [k, v] of Object.entries(o)) foundry.utils.setProperty(out, k, v)
    return out
  }
})

afterEach(() => {
  game.settings.get = () => null
})

describe('images livrées', () => {
  const file = (p) => p.replace('systems/sr5/', '')
  it('chaque CI, chaque sprite et chaque contact de la liste a ses fichiers', () => {
    for (const t of ['iceAcid', 'iceBinder', 'iceBlack', 'iceBlaster', 'iceBloodhound', 'iceBlueGoo', 'iceCatapult', 'iceCrash',
      'iceFlicker', 'iceJammer', 'iceKiller', 'iceMarker', 'icePatrol', 'iceProbe', 'iceScramble', 'iceShocker', 'iceSparky',
      'iceSleuther', 'iceTarBaby', 'iceTrack']) {
      const i = defaultIceImages(t)
      expect(existsSync(file(i.portrait)) && existsSync(file(i.token))).toBe(true)
    }
    for (const t of ['companion', 'courier', 'crack', 'data', 'fault', 'generalist', 'machine']) {
      const i = defaultSpriteImages(t)
      expect(existsSync(file(i.portrait)) && existsSync(file(i.token))).toBe(true)
    }
    for (const e of CONTACT_IMAGES) expect(existsSync(file(`${CONTACT_IMAGE_DIR}/${e.file}`))).toBe(true)
  })
  it('chaque jeton rond annoncé existe et va avec son portrait', () => {
    const avecJeton = CONTACT_IMAGES.filter((e) => e.token)
    // 82 jetons ronds de DjamZ pour 83 portraits : seule Haley Soprano (nommée) n'en a pas
    expect(CONTACT_IMAGES.filter((e) => !e.token).map((e) => e.file)).toEqual(['haley-soprano-fixer.webp'])
    for (const e of avecJeton) {
      expect(existsSync(file(`${CONTACT_IMAGE_DIR}/${e.token}`)), e.token).toBe(true)
      expect(e.token).toBe(e.file.replace(/\.webp$/, '-token.webp'))
    }
  })
  it('chaque type d’esprit annoncé a ses quatre paliers', () => {
    for (const t of SPIRIT_IMAGE_TYPES) for (const force of [1, 4, 7, 10]) {
      const i = defaultSpiritImages(t, force, (x) => x)
      expect(existsSync(file(i.portrait)) && existsSync(file(i.token)), `${t} ${force}`).toBe(true)
    }
  })
})

describe('isDefaultActorImage', () => {
  it('icônes du système et images posées ici : oui ; image du MJ : non', () => {
    for (const img of [undefined, '', 'icons/svg/mystery-man.svg', DEVICE, GRUNT, `${ICE_IMAGE_DIR}/iceAcid/token.webp`,
      `${CONTACT_IMAGE_DIR}/x.webp`]) expect(isDefaultActorImage(img)).toBe(true)
    expect(isDefaultActorImage('worlds/w/ci.webp')).toBe(false)
  })
})

describe('CI et sprites', () => {
  it('chemins par type, null pour un type sans image', () => {
    expect(defaultIceImages('iceAcid')).toEqual({
      portrait: `${ICE_IMAGE_DIR}/iceAcid/portrait.webp`, token: `${ICE_IMAGE_DIR}/iceAcid/token.webp`
    })
    expect(defaultIceImages('iceDesigned')).toBeNull()
    expect(defaultSpriteImages('fault').token).toBe(`${SPRITE_IMAGE_DIR}/fault/token.webp`)
    expect(defaultSpriteImages('')).toBeNull()
  })
  it("n'écrase jamais l'image du MJ", () => {
    expect(imageChanges('worlds/w/a.webp', DEVICE, defaultIceImages('iceAcid'))).toBeNull()
    expect(imageChanges(DEVICE, DEVICE, defaultIceImages('iceAcid')).img).toBe(`${ICE_IMAGE_DIR}/iceAcid/portrait.webp`)
  })
})

describe('contacts', () => {
  it('métatype d’abord, puis métier, puis genre', () => {
    expect(contactImageCandidates({
      job: 'Barman', metatype: 'ork', gender: 'female'
    }, LIST).map((e) => e.file)).toEqual(['barman-ork-femme.webp'])
    // une orke street doc : l'orke passe avant le métier
    expect(contactImageCandidates({
      job: 'Street doc', metatype: 'ork', gender: 'female'
    }, LIST).map((e) => e.file)).toEqual(['barman-ork-femme.webp'])
  })
  it("un personnage nommé ne vient que sur son métier", () => {
    expect(contactImageCandidates({
    }, LIST).some((e) => e.named)).toBe(false)
    expect(contactImageCandidates({
      job: 'Fixer'
    }, LIST).map((e) => e.file)).toEqual(['damian-welsch-fixer.webp'])
  })
  it('même contact, même visage ; tirage dans [0, 1)', () => {
    const a = defaultContactImages({
      }, 'abc123', LIST)?.portrait, b = defaultContactImages({
      }, 'abc123', LIST)?.portrait
    expect(a).toBe(b)
    for (const s of ['', 'x', 'abcdefghijklmnop']) expect(seededRandom(s)).toBeGreaterThanOrEqual(0)
    for (const s of ['', 'x', 'abcdefghijklmnop']) expect(seededRandom(s)).toBeLessThan(1)
  })
  it('le jeton rond va avec le portrait tiré ; sans jeton rond, le portrait sert de jeton', () => {
    expect(defaultContactImages({
      job: 'Barman', metatype: 'ork', gender: 'female'
    }, 's', LIST)).toEqual({
      portrait: `${CONTACT_IMAGE_DIR}/barman-ork-femme.webp`, token: `${CONTACT_IMAGE_DIR}/barman-ork-femme-token.webp`
    })
    expect(defaultContactImages({
      job: 'Fixer'
    }, 's', LIST).token).toBe(`${CONTACT_IMAGE_DIR}/damian-welsch-fixer.webp`)
    // sur la vraie liste, pour toute graine : le portrait tiré, et son jeton
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const i = defaultContactImages({
        metatype: 'ork', gender: 'male'
      }, seed)
      expect(i.portrait).toBe(defaultContactImages({
        metatype: 'ork', gender: 'male'
      }, seed)?.portrait)
      expect(i.token).toBe(i.portrait.replace(/\.webp$/, '-token.webp'))
    }
  })
})

function actor(type, src) {
  return {
    type, _source: src,
    updateSource(changes) { this.applied = changes },
  }
}

describe('crochets', () => {
  it('création : CI, sprite, contact ; réglage décoché : rien', () => {
    const ci = actor('actorDevice', {
      img: DEVICE, prototypeToken: {
        texture: {
          src: DEVICE
        }
      }, system: {
        matrix: {
          deviceType: 'ice', deviceSubType: 'iceKiller'
        }
      }
    })
    defaultImageOnCreate(ci)
    expect(ci.applied['prototypeToken.texture.src']).toBe(`${ICE_IMAGE_DIR}/iceKiller/token.webp`)

    const sprite = actor('actorSprite', {
      img: '', prototypeToken: {
        texture: {
          src: ''
        }
      }, system: {
        type: 'machine'
      }
    })
    defaultImageOnCreate(sprite)
    expect(sprite.applied.img).toBe(`${SPRITE_IMAGE_DIR}/machine/portrait.webp`)

    const contact = actor('actorGrunt', {
      img: GRUNT, prototypeToken: {
        texture: {
          src: GRUNT
        }
      }, system: {
        creatorId: 'pc', creatorItemId: 'it1', biography: {
          metatype: 'troll', gender: 'female'
        }
      }
    })
    defaultImageOnCreate(contact, {
    }, {
    }, 'u', () => ({
      type: 'itemContact', system: {
        type: ''
      }
    }))
    expect(contact.applied.img).toMatch(new RegExp(`^${CONTACT_IMAGE_DIR}/.*troll.*\\.webp$`))
    expect(contact.applied['prototypeToken.texture.src']).toBe(contact.applied.img.replace(/\.webp$/, '-token.webp'))

    // un sbire fait à la main n'est pas un contact
    const grunt = actor('actorGrunt', {
      img: GRUNT, prototypeToken: {
        texture: {
          src: GRUNT
        }
      }, system: {
      }
    })
    defaultImageOnCreate(grunt)
    expect(grunt.applied).toBeUndefined()

    game.settings.get = () => false
    const off = actor('actorSprite', {
      img: '', prototypeToken: {
        texture: {
          src: ''
        }
      }, system: {
        type: 'machine'
      }
    })
    defaultImageOnCreate(off)
    expect(off.applied).toBeUndefined()
  })

  it('mise à jour : un appareil devenu CI prend ses images ; image du MJ : rien', () => {
    const doc = actor('actorDevice', {
      img: DEVICE, prototypeToken: {
        texture: {
          src: DEVICE
        }
      }, system: {
        matrix: {
          deviceType: '', deviceSubType: ''
        }
      }
    })
    const changes = {
      'system.matrix.deviceType': 'ice', 'system.matrix.deviceSubType': 'iceProbe'
    }
    defaultImageOnUpdate(doc, changes)
    expect(changes.img).toBe(`${ICE_IMAGE_DIR}/iceProbe/portrait.webp`)

    const mj = actor('actorSprite', {
      img: 'worlds/w/s.webp', prototypeToken: {
        texture: {
          src: DEVICE
        }
      }, system: {
        type: 'data'
      }
    })
    const c2 = {
      system: {
        type: 'fault'
      }
    }
    defaultImageOnUpdate(mj, c2)
    expect(c2.img).toBeUndefined()
  })
})

// Relecture du 21/10, D2 et D3
describe('contacts : visage choisi dans la banque, personnage en jeton non lié', () => {
  const orkBarman = item => actor('actorGrunt', {
    img: item.img, prototypeToken: {
      texture: {
        src: item.token ?? item.img
      }
    }, system: {
      creatorId: 'pc', creatorItemId: 'it1', biography: {
        metatype: 'ork', gender: 'male'
      }
    }
  })
  const barmanItem = () => ({
    type: 'itemContact', system: {
      type: 'Barman'
    }
  })

  it('garde un portrait de la banque choisi par le MJ, même s’il ne correspond pas', () => {
    const chosen = `${CONTACT_IMAGE_DIR}/street-doc-humain-femme.webp`
    const called = orkBarman({
      img: chosen
    })
    defaultImageOnCreate(called, {
    }, {
    }, 'u', barmanItem)
    expect(called.applied).toBeUndefined()
  })
  it('donne le visage tiré au premier appel, et le même au rappel (jeton rond retenu au renvoi)', () => {
    const first = orkBarman({
      img: GRUNT
    })
    defaultImageOnCreate(first, {
    }, {
    }, 'u', barmanItem)
    expect(first.applied.img).toMatch(new RegExp(`^${CONTACT_IMAGE_DIR}/.*ork.*\\.webp$`))
    // Au renvoi, l'objet garde le jeton porté (rememberSidekickToken), pas le portrait
    const again = orkBarman({
      img: GRUNT, token: first.applied['prototypeToken.texture.src']
    })
    defaultImageOnCreate(again, {
    }, {
    }, 'u', barmanItem)
    expect(again.applied).toEqual(first.applied)
  })
  it('un portrait de la banque est un défaut seulement s’il est celui tiré pour ce contact', () => {
    const images = {
      portrait: `${CONTACT_IMAGE_DIR}/a.webp`, token: `${CONTACT_IMAGE_DIR}/a-token.webp`, contact: true
    }
    expect(isDefaultContactPortrait(GRUNT, images)).toBe(true)
    expect(isDefaultContactPortrait(undefined, images)).toBe(true)
    expect(isDefaultContactPortrait(`${CONTACT_IMAGE_DIR}/a.webp`, images)).toBe(true)
    expect(isDefaultContactPortrait(`${CONTACT_IMAGE_DIR}/b.webp`, images)).toBe(false)
    expect(imageChanges(`${CONTACT_IMAGE_DIR}/b.webp`, GRUNT, images)).toBeNull()
    // CI et sprites : leur dossier reste un défaut
    expect(imageChanges(`${ICE_IMAGE_DIR}/iceAcid/portrait.webp`, DEVICE, defaultIceImages('iceKiller')).img)
      .toBe(`${ICE_IMAGE_DIR}/iceKiller/portrait.webp`)
  })
  it('trouve l’objet contact d’un personnage en jeton non lié (creatorId = id du jeton)', () => {
    const contact = {
      id: 'it1', type: 'itemContact'
    }
    const tokenActor = {
      items: new Map([['it1', contact]])
    }
    const actors = {
      tok1: tokenActor
    }
    expect(contactItemOf('tok1', 'it1', id => actors[id])).toBe(contact)
    expect(contactItemOf('absent', 'it1', id => actors[id])).toBeNull()
    expect(contactItemOf('tok1', 'it1', () => {
      throw new Error('pas de canevas')
    })).toBeNull()
    expect(readFileSync(new URL('../modules/entities/actors/default-actor-images.js', import.meta.url), 'utf8'))
      .toMatch(/SR5_EntityHelpers\.getRealActorFromID\(id\)/)
  })
})
