import {
  describe, it, expect
} from 'vitest'
import {
  plainLetters, cipherKeyOf, encipher, encipherHtml, decipher, sameKey, cipherOf, readMessage, readFile, crackDice,
  resolveCrack
} from '../modules/system/commcode-cipher.js'

describe('cipher: the key cipher (lot 39)', () => {
  it('shifts each letter by the letter of the key under it, the key said again', () => {
    // The classic example of the Vigenère cipher
    expect(encipher("ATTACKATDAWN", "LEMON")).toBe("LXFOPVEFRNHR")
    expect(decipher("LXFOPVEFRNHR", "LEMON")).toBe("ATTACKATDAWN")
  })
  it('keeps the case, the digits and the signs; the key moves on letters only', () => {
    expect(encipher("Rdv 22h, quai 7 !", "b")).toBe("Sew 22i, rvbj 7 !")
    expect(decipher(encipher("Rdv 22h, quai 7 !", "Clé"), "Clé")).toBe("Rdv 22h, quai 7 !")
  })
  it('drops the accents of the text and of the key', () => {
    expect(plainLetters("Été, cœur, Straße")).toBe("Ete, coeur, Strasse")
    expect(cipherKeyOf("clé 2 été")).toBe("CLEETE")
    expect(decipher(encipher("À l'hôtel", "évêché"), "EVECHE")).toBe("A l'hotel")
  })
  it('without a letter in the key, nothing is ciphered', () => {
    expect(cipherKeyOf("1234 !")).toBe("")
    expect(encipher("abc", "123")).toBe("abc")
  })
  it('compares keys as they cipher', () => {
    expect(sameKey("Lune", "LUNE ")).toBe(true)
    expect(sameKey("lune", "lun")).toBe(false)
    expect(sameKey("", "")).toBe(false)
  })
})

describe('cipher: who reads a message', () => {
  const entry = {
    text: encipher("Le colis est au port", "corbeau"),
    cipher: {
      key: "corbeau", rating: 3, crackedBy: ["hackerId"]
    }
  }
  it('a message without cipher is read by all', () => {
    expect(readMessage({
      text: "salut"
    })).toEqual({
      text: "salut", ciphered: false, clear: true, how: "plain"
    })
    expect(cipherOf({
      text: "x", cipher: {
        key: "123"
      }
    })).toBe(null)
  })
  it('the gamemaster and the sender read the clear text', () => {
    expect(readMessage(entry, {
      isGM: true
    }).text).toBe("Le colis est au port")
    expect(readMessage(entry, {
      author: true
    }).how).toBe("author")
  })
  it('the recipient reads it with her key, the cipher with a wrong one or none', () => {
    expect(readMessage(entry, {
      key: "CORBEAU"
    })).toMatchObject({
      text: "Le colis est au port", clear: true, how: "key"
    })
    expect(readMessage(entry, {
      key: "pie"
    })).toMatchObject({
      text: entry.text, clear: false, how: "wrongKey"
    })
    expect(readMessage(entry)).toMatchObject({
      text: entry.text, clear: false, how: "locked"
    })
  })
  it('a snooper reads it once she broke it, and she alone', () => {
    expect(readMessage(entry, {
      snooperId: "hackerId"
    }).how).toBe("cracked")
    expect(readMessage(entry, {
      snooperId: "other"
    }).how).toBe("locked")
  })
})

describe('cipher: the content of a file', () => {
  const file = (system = {
  }) => ({
    type: 'itemFile', system: {
      content: '<p>Code d&apos;accès : <b>Héron</b> 7</p>', protection: 0, cipher: {
        key: '', known: ''
      }, ...system
    }
  })
  it('ciphers the text of an HTML content, its tags and entities whole', () => {
    expect(encipherHtml('<p class="a">ab &amp; c</p>', 'b')).toBe('<p class="a">bc &amp; d</p>')
  })
  it('shows a ciphered file in cipher, in clear with the key, always in clear to the gamemaster', () => {
    const f = file({
      cipher: {
        key: 'lune', known: ''
      }
    })
    expect(readFile(f, {
      cipherOn: true
    })).toMatchObject({
      how: 'ciphered', ciphered: true, html: encipherHtml(f.system.content, 'lune')
    })
    expect(readFile(file({
      cipher: {
        key: 'lune', known: 'LUNE'
      }
    }), {
      cipherOn: true
    })).toMatchObject({
      how: 'key', html: f.system.content
    })
    expect(readFile(f, {
      isGM: true, cipherOn: true
    }).how).toBe('gm')
  })
  it('without the setting, the key is ignored: the book\'s protection only', () => {
    expect(readFile(file({
      protection: 2, cipher: {
        key: 'lune', known: ''
      }
    })).how).toBe('protected')
    expect(readFile(file()).how).toBe('clear')
  })
})

describe('cipher: breaking a message as a file is cracked (SR5 p. 242)', () => {
  const entry = {
    text: "x", cipher: {
      key: "k", rating: 2, crackedBy: []
    }
  }
  it('opposes the rating x 2 dice', () => {
    expect(crackDice(entry)).toBe(4)
    expect(crackDice({
      text: "x"
    })).toBe(0)
  })
  it('asks for net hits', () => {
    expect(resolveCrack(entry, "h", 3, 2)).toEqual({
      outcome: "cracked", net: 1
    })
    expect(resolveCrack(entry, "h", 2, 2).outcome).toBe("failed")
    expect(resolveCrack({
      text: "x"
    }, "h", 3, 0).outcome).toBe("plain")
    expect(resolveCrack({
      ...entry, cipher: {
        ...entry.cipher, crackedBy: ["h"]
      }
    }, "h", 3, 0).outcome).toBe("already")
  })
})
