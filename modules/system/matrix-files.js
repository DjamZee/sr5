// The files of the Matrix, as plain rules with no Foundry in them so that tests can read them (objet Fichier, decision
// of DjamZ 07/10). The book:
// - SR5 p. 228: a file has no rating; it defends with its owner's. SR5 p. 230: it cannot be damaged, no monitor;
// - SR5 p. 237: Matrix Perception tells the date of its last edit, whether a data bomb is on it, whether it is
//   protected and the rating of its protection;
// - SR5 p. 240, Edit File (Computer + Logic [Data Processing] v. Intuition + Firewall of its host, or of its owner):
//   create, change, copy, erase or protect it. A protected file cannot be read, changed, erased or copied; a data bomb
//   on it blows up in the face of whoever opens it. Its owner protects it with Computer + Logic [Data Processing], the
//   hits being the rating of the protection;
// - SR5 p. 242, Crack File (Hacking + Logic [Attack] v. protection x 2): removes the protection; no effect on a file
//   that has none;
// - SR5 p. 243, Set Data Bomb (Software + Logic [Sleaze] v. Device Rating x 2): a bomb whose rating is at most the
//   net hits, that erases the file or not, one per file. It goes off when someone tries to read, copy, protect or erase
//   the file, or to set another bomb, without its password: (rating)D6 Matrix damage to the icon that set it off,
//   resisted normally, the file erased if it was set to, then the bomb erases itself. With the password it stays;
// - SR5 p. 240, Disarm Data Bomb (Software + Intuition [Firewall] v. bomb rating x 2): one net hit erases the bomb,
//   otherwise it goes off.
// The rulings taken where the book is silent (said in the wiki page "Fichiers"):
// - the password is known to whoever set the bomb, and to the owner of the file (who carries it);
// - the protection and the bomb are tried in the order of the book's sentences: the bomb goes off first, on any try
//   of Edit File (it blows up "in the face" of the one who opens it); a protected file then makes the edit fail;
// - the file's own dice for Crack File, Disarm and Set Data Bomb are rolled by the active gamemaster.

export const FILE_TYPE = "itemFile"

// The actions that work on a file (SR5 p. 245, "Manipulation de fichiers") and those a file can be the target of
// besides (it is an icon: marks, SR5 p. 237)
export const FILE_ACTIONS = ["editFile", "crackFile", "setDataBomb", "disarmDataBomb"]
export const FILE_NODE_ACTIONS = ["matrixPerception", "hackOnTheFly", "bruteForce", "eraseMark", ...FILE_ACTIONS]
// Those whose opposition is a number of dice the gamemaster rolls, no actor defending
export const FILE_ROLLED_ACTIONS = ["crackFile", "setDataBomb", "disarmDataBomb"]

export function isFile(item){
  return item?.type === FILE_TYPE
}

const rating = value => Math.max(0, Math.floor(Number(value) || 0))

/** The protection of a file, 0 when it has none */
export function protectionOf(file){
  return rating(file?.system?.protection)
}

/** The data bomb of a file, or null */
export function bombOf(file){
  const bomb = file?.system?.dataBomb
  const value = rating(bomb?.rating)
  return value > 0 ? {
    rating: value, destroysFile: bomb.destroysFile === true, setBy: bomb.setBy ?? "", setByName: bomb.setByName ?? ""
  } : null
}

/**
 * Does someone know the password of a file's bomb? Whoever set it, and the owner of the file.
 * @param {Object} file
 * @param {Array<String>} actorIds   every id the actor answers to
 * @param {Array<String>} holderIds  every id the actor that carries the file answers to
 */
export function knowsPassword(file, actorIds = [], holderIds = []){
  const bomb = bombOf(file)
  if (!bomb) return true
  if (bomb.setBy && actorIds.includes(bomb.setBy)) return true
  return actorIds.some(id => holderIds.includes(id))
}

/**
 * The dice the file opposes an action with (SR5 p. 240, 242, 243), or null when there is nothing to oppose.
 * @param {String} action
 * @param {Object} file
 * @param {Number} ownerDeviceRating  the Device Rating of the actor that carries it (SR5 p. 228)
 */
export function fileOppositionDice(action, file, ownerDeviceRating = 0){
  switch (action){
    case "crackFile": {
      const protection = protectionOf(file)
      return protection > 0 ? protection * 2 : null
    }
    case "disarmDataBomb": {
      const bomb = bombOf(file)
      return bomb ? bomb.rating * 2 : null
    }
    case "setDataBomb":
      return rating(ownerDeviceRating) * 2
    default:
      return null
  }
}

/**
 * What an action on a file comes to.
 * @param {Object} data
 * @param {String} data.action          crackFile, setDataBomb, disarmDataBomb, editFile
 * @param {Object} data.file
 * @param {Number} data.hits            the attacker's hits
 * @param {Number} data.oppositionHits  the file's hits (its dice), or its defender's for Edit File
 * @param {Boolean} data.knowsPassword  the attacker knows the bomb's password (knowsPassword)
 * @param {Object} [data.bomb]          Set Data Bomb: {rating wished, destroysFile}
 * @param {String} [data.mode]          Edit File: "edit" or "protect" (the owner's protection)
 * @param {Object} [data.by]            the attacker {id, name}: who set the bomb, who edited the file
 * @param {Number} [data.now]           game.time.worldTime, the time of the edit
 * @param {Boolean} [data.ciphered]     the file is ciphered with a key (lot 39, a house rule): it counts as protected,
 *                                      and Crack File removes the cipher with the protection
 * @return {{outcome: String, update: Object|null, explosion: Object|null, net: Number}}
 *   outcome: cracked, notProtected, failed, bombSet, alreadyBombed, disarmed, noBomb, exploded, edited, protected,
 *            locked (a protected file refuses the edit);
 *   update: the fields of the file to write (system.*), or null; explosion: {rating, destroysFile} when a bomb goes off
 */
export function resolveFileAction({
  action, file, hits = 0, oppositionHits = 0, knowsPassword: password = false, bomb: wished = null, mode = "edit",
  by = {
  }, now = 0, ciphered = false
} = {
}){
  const edited = {
    "system.lastEdit.worldTime": Number(now) || 0, "system.lastEdit.by": by?.id ?? "", "system.lastEdit.byName": by?.name ?? ""
  }
  const net = rating(hits) - rating(oppositionHits)
  const bomb = bombOf(file)
  const result = (outcome, update = null, explosion = null) => ({
    outcome, update, explosion, net
  })
  const goesOff = () => result("exploded", bomb.destroysFile ? null : {
    "system.dataBomb.rating": 0, "system.dataBomb.setBy": "", "system.dataBomb.setByName": "", "system.dataBomb.destroysFile": false
  }, {
    rating: bomb.rating, destroysFile: bomb.destroysFile
  })
  switch (action){
    case "crackFile":
      if (!protectionOf(file) && !ciphered) return result("notProtected")
      return net > 0 ? result("cracked", {
        "system.protection": 0, ...(ciphered ? {
          "system.cipher.key": "", "system.cipher.known": ""
        } : {
        })
      }) : result("failed")
    case "disarmDataBomb":
      if (!bomb) return result("noBomb")
      if (net > 0) return result("disarmed", {
        "system.dataBomb.rating": 0, "system.dataBomb.setBy": "", "system.dataBomb.setByName": "", "system.dataBomb.destroysFile": false
      })
      return goesOff()
    case "setDataBomb": {
      // One bomb per file: without its password, trying to set another one sets the first one off
      if (bomb) return password ? result("alreadyBombed") : goesOff()
      if (net <= 0) return result("failed")
      const value = Math.min(net, rating(wished?.rating) || net)
      return result("bombSet", {
        "system.dataBomb.rating": value, "system.dataBomb.destroysFile": wished?.destroysFile === true,
        "system.dataBomb.setBy": by?.id ?? "", "system.dataBomb.setByName": by?.name ?? "",
      })
    }
    case "editFile":
      if (bomb && !password) return goesOff()
      // The owner protects it: a simple test, the hits are the rating (SR5 p. 240)
      if (mode === "protect") return rating(hits) > 0 ? result("protected", {
        "system.protection": rating(hits), ...edited
      }) : result("failed")
      if (protectionOf(file) || ciphered) return result("locked")
      return net > 0 ? result("edited", edited) : result("failed")
    default:
      return result("failed")
  }
}

/**
 * The Matrix damage of a bomb that goes off (SR5 p. 243): the sum of (rating)D6.
 * @param {Array<Number>} dice  the faces rolled
 */
export function bombDamage(dice = []){
  return (Array.isArray(dice) ? dice : []).reduce((total, face) => total + rating(face), 0)
}

/** What Matrix Perception reads on a file (SR5 p. 237), for pan-perception.js */
export function fileFacts(file){
  if (!isFile(file)) return null
  const edit = file.system?.lastEdit ?? {
  }
  return {
    protection: protectionOf(file),
    bomb: !!bombOf(file),
    lastEdit: typeof edit.worldTime === "number" ? {
      worldTime: edit.worldTime, byName: edit.byName ?? ""
    } : null,
  }
}
