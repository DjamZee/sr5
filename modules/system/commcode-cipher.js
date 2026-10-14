// The cipher of the commcode messages and of the files (lot 39), as plain rules with no Foundry in them so that tests
// can read them. A house rule above the book: a key cipher of the Vigenère kind, each letter shifted by the matching
// letter of a key said again and again (DjamZ, 14/10).
//
// What the book says, and where:
// - SR5 p. 240, Edit File: the owner of a file protects it (VO « encrypt ») with Computer + Logic [Data Processing],
//   the hits being the rating of the protection; a protected file cannot be read, changed, erased or copied.
// - SR5 p. 242, Crack File (complex action, 1 mark): Hacking + Logic [Attack] v. protection rating x 2 removes it.
// - SR5 p. 247, the Decryption program: +1 to the Attack attribute (the limit of Crack File).
// - Kill Code p. 104, Weaken Encryption (a complex form): lowers the protection rating by the net hits.
// - SR5 p. 241, Send Message and Snoop: nothing about a message protected by its sender. The book has no key cipher of
//   messages, so the world setting is unchecked by default (arbitrage de DjamZ, 14/10: the cipher is his table's).
// The rulings taken where the book is silent (said in the wiki page Matrice-IA-et-appareils):
// - a message is ciphered as a file is protected: the sender's Computer + Logic [Data Processing] hits are its rating;
// - a snooper breaks it as a file is cracked (SR5 p. 242): her success shows the clear text to her alone;
// - the letters lose their accents (é is e), the digits and the signs are left as they are: a cipher a player can
//   undo by hand.

export const CIPHER_SETTING = "sr5CommcodeCipher"
export const CIPHER_ALPHABET = 26

const LIGATURES = {
  "œ": "oe", "Œ": "OE", "æ": "ae", "Æ": "AE", "ß": "ss"
}

/** The text with its accents dropped, the letters left A to Z */
export function plainLetters(text){
  return String(text ?? "").replace(/[œŒæÆß]/g, l => LIGATURES[l]).normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/** The key as it shifts: its letters only, in capitals; "" when it has none */
export function cipherKeyOf(key){
  return plainLetters(key).toUpperCase().replace(/[^A-Z]/g, "")
}

export function hasKey(key){
  return cipherKeyOf(key).length > 0
}

function shift(text, key, sign){
  const letters = cipherKeyOf(key)
  const source = plainLetters(text)
  if (!letters) return source
  let i = 0
  return source.replace(/[A-Za-z]/g, ch => {
    const base = ch <= "Z" ? 65 : 97
    const by = letters.charCodeAt(i++ % letters.length) - 65
    return String.fromCharCode(((ch.charCodeAt(0) - base + sign * by) % CIPHER_ALPHABET + CIPHER_ALPHABET) % CIPHER_ALPHABET + base)
  })
}

/** The text ciphered with the key: each letter moved forward by the letter of the key under it (A = 0, B = 1…) */
export function encipher(text, key){
  return shift(text, key, 1)
}

/** The ciphered text read back with a key: the clear text with the right one, nonsense with a wrong one */
export function decipher(text, key){
  return shift(text, key, -1)
}

/** Two keys that cipher alike */
export function sameKey(a, b){
  const left = cipherKeyOf(a)
  return !!left && left === cipherKeyOf(b)
}

const rating = value => Math.max(0, Math.floor(Number(value) || 0))

/**
 * The cipher of a register entry, or null. {key, rating, crackedBy: [snooper ids]}
 * @param {Object} entry
 */
export function cipherOf(entry){
  const cipher = entry?.cipher
  if (!cipher || !hasKey(cipher.key)) return null
  return {
    key: String(cipher.key), rating: rating(cipher.rating), crackedBy: Array.isArray(cipher.crackedBy) ? cipher.crackedBy : []
  }
}

/**
 * What a reader sees of a message.
 * @param {Object} entry
 * @param {Object} reader
 * @param {Boolean} [reader.isGM]        the gamemaster sees the clear text, always
 * @param {Boolean} [reader.author]      the sender wrote it
 * @param {String}  [reader.key]         the key the reader keeps for this correspondent (her directory)
 * @param {String}  [reader.snooperId]   the snooper who intercepted it: clear once she broke it
 * @return {{text: String, ciphered: Boolean, clear: Boolean, how: String}}
 *   how: "plain" (never ciphered), "gm", "author", "key" (read with the reader's key), "cracked", "wrongKey" (her
 *   key does not open it: she sees the cipher), "locked"
 */
export function readMessage(entry, {
  isGM = false, author = false, key = "", snooperId = null
} = {
}){
  const text = String(entry?.text ?? "")
  const cipher = cipherOf(entry)
  if (!cipher) return {
    text, ciphered: false, clear: true, how: "plain"
  }
  const clear = how => ({
    text: decipher(text, cipher.key), ciphered: true, clear: true, how
  })
  if (isGM) return clear("gm")
  if (author) return clear("author")
  if (snooperId && cipher.crackedBy.includes(snooperId)) return clear("cracked")
  // The reader's own key; a wrong one leaves her the cipher, and the window says her key does not open it
  if (sameKey(key, cipher.key)) return clear("key")
  return {
    text, ciphered: true, clear: false, how: hasKey(key) ? "wrongKey" : "locked"
  }
}

/**
 * The dice of a cipher against a snooper (SR5 p. 242, Crack File: protection rating x 2).
 * @param {Object} entry
 */
export function crackDice(entry){
  const cipher = cipherOf(entry)
  return cipher ? cipher.rating * 2 : 0
}

/**
 * What a try to break a message comes to: net hits needed, as Crack File (SR5 p. 242).
 * @return {{outcome: "cracked"|"failed"|"plain"|"already", net: Number}}
 */
export function resolveCrack(entry, snooperId, hits, oppositionHits){
  const cipher = cipherOf(entry)
  const net = rating(hits) - rating(oppositionHits)
  if (!cipher) return {
    outcome: "plain", net
  }
  if (cipher.crackedBy.includes(snooperId)) return {
    outcome: "already", net
  }
  return {
    outcome: net > 0 ? "cracked" : "failed", net
  }
}
