// What a Matrix Perception brings back (couronne du PAN, lot 5), as plain rules with no Foundry in them so that tests
// can read them. The book:
// - SR5 p. 242: a simple test, one piece of information per hit (the test has no threshold: every hit is an excess
//   one); an icon farther than 100 m takes the first hit to be spotted, the others go to information; a silent icon
//   turns it into an opposed test against Logic + Sleaze, the net hits used the same way. Among the marks seen, one
//   only recognises those of personas one has marked oneself: the system gives their number only;
// - SR5 p. 237: the list of what it can reveal (not exhaustive), every entry below, and "an icon is spotted if at
//   least one piece of information on it is obtained, while it runs silent": any answer on a target spots it;
// - SR5 p. 236: a spotted icon stays spotted until it reboots, jacks out, or beats the observer with Hide.
// The rulings of DjamZ (07/10, CAHIER-COURONNE-PAN.md): Q9, the whole list is automated; the four entries the system
// cannot work out (files; "a silent icon in this host") are offered with an answer the gamemaster types, and the hook
// sr5.matrixPerceptionInfo lets a provider (the module Matrice v1) answer them instead.

// kind: "target" asks for a target, "around" does not. source: "system" is worked out, "gm" is typed by the
// gamemaster (or a provider). drawn: the crown draws it on the icon, the rest is read in the message.
export const PERCEPTION_ENTRIES = [
  {
    key: "spot", kind: "target", source: "system"
  },
  {
    key: "monitor", kind: "target", source: "system", drawn: true
  },
  {
    key: "programs", kind: "target", source: "system"
  },
  {
    key: "deviceRating", kind: "target", source: "system"
  },
  {
    key: "commcode", kind: "target", source: "system"
  },
  {
    key: "attribute", kind: "target", source: "system", params: ["attack", "sleaze", "dataProcessing", "firewall"]
  },
  {
    key: "iconType", kind: "target", source: "system"
  },
  {
    key: "grid", kind: "target", source: "system"
  },
  {
    key: "lastAction", kind: "target", source: "system"
  },
  {
    key: "marks", kind: "target", source: "system", drawn: true
  },
  {
    key: "fileEdited", kind: "target", source: "gm"
  },
  {
    key: "fileBomb", kind: "target", source: "gm"
  },
  {
    key: "fileProtection", kind: "target", source: "gm"
  },
  {
    key: "silentNearby", kind: "around", source: "system"
  },
  {
    key: "silentInHost", kind: "around", source: "gm"
  },
]

export const PERCEPTION_KEYS = PERCEPTION_ENTRIES.map(e => e.key)

export function entryOf(key){
  return PERCEPTION_ENTRIES.find(e => e.key === key) ?? null
}

/**
 * How many pieces of information a card gives (SR5 p. 242): the hits of a simple test, the net hits of an opposed one.
 * @param {Object} data
 * @param {Number} data.hits           the observer's hits
 * @param {Number|null} [data.defenseHits]  the silent icon's hits, when it defended
 */
export function perceptionBudget({
  hits = 0, defenseHits = null
} = {
}){
  const net = (Number(hits) || 0) - (Number(defenseHits) || 0)
  return Math.max(0, Math.floor(net))
}

/**
 * Check the pieces of information asked for.
 * @param {Array<{key: String, param?: String}>} choices
 * @param {Number} budget        perceptionBudget
 * @param {Object} [options]
 * @param {Boolean} [options.hasTarget]  the card aims at an icon
 * @return {{ok: Boolean, reason: String|null, choices: Array}}  reason: empty, tooMany, unknown, noTarget, twice
 */
export function checkChoices(choices = [], budget = 0, {
  hasTarget = true
} = {
}){
  const list = Array.isArray(choices) ? choices : []
  const result = (ok, reason) => ({
    ok, reason, choices: ok ? list.map(c => ({
      key: c.key, ...(c.param ? {
        param: c.param
      } : {
      })
    })) : []
  })
  if (!list.length) return result(false, "empty")
  if (list.length > budget) return result(false, "tooMany")
  const seen = new Set()
  for (const choice of list){
    const entry = entryOf(choice?.key)
    if (!entry) return result(false, "unknown")
    if (entry.params && !entry.params.includes(choice.param)) return result(false, "unknown")
    if (entry.kind === "target" && !hasTarget) return result(false, "noTarget")
    const id = `${choice.key}|${choice.param ?? ""}`
    if (seen.has(id)) return result(false, "twice")
    seen.add(id)
  }
  return result(true, null)
}

/**
 * The answer to one entry, from what the system knows of the target (pan-perception-card.js gathers the facts).
 * @param {{key: String, param?: String}} choice
 * @param {Object} facts
 * @param {Object} facts.monitor      {damage, boxes} or null
 * @param {Array<String>} facts.programs  the names of the programs running on a persona, or null for a device
 * @param {Number} facts.deviceRating
 * @param {String} facts.commcode
 * @param {Object} facts.attributes   {attack, sleaze, dataProcessing, firewall}: a number, or null when the icon
 *                                    does not have it (SR5 p. 227: most devices only have Data Processing and Firewall)
 * @param {String} facts.iconType     persona, device, host, ice
 * @param {String} facts.grid
 * @param {Object} facts.lastAction   {key, worldTime, round} or null
 * @param {Array} facts.marks         [{ownerId, value}]
 * @param {Number|null} facts.silentNearby  silent icons within 100 m of the observer
 * @param {Object} [typed]            the gamemaster's or a provider's answers, by key
 * @return {{key: String, param?: String, value: *, missing: Boolean}}
 *   missing: the system has nothing to say (no commcode written, no action known, no answer typed)
 */
export function answerOf(choice, facts = {
}, typed = {
}){
  const {
    key, param
  } = choice ?? {
  }
  const answer = (value, missing = false) => ({
    key, ...(param ? {
      param
    } : {
    }), value, missing
  })
  switch (key){
    case "spot":
      return answer(true)
    case "monitor":
      return facts.monitor ? answer({
        damage: Number(facts.monitor.damage) || 0, boxes: Number(facts.monitor.boxes) || 0
      }) : answer(null, true)
    case "programs":
      return Array.isArray(facts.programs) ? answer([...facts.programs]) : answer(null, true)
    case "deviceRating":
      return answer(Number(facts.deviceRating) || 0)
    case "commcode": {
      const code = String(facts.commcode ?? "").trim()
      return code ? answer(code) : answer(null, true)
    }
    case "attribute": {
      const value = facts.attributes?.[param]
      return typeof value === "number" ? answer(value) : answer(null, true)
    }
    case "iconType":
      return answer(facts.iconType ?? "device")
    case "grid":
      return facts.grid ? answer(facts.grid) : answer(null, true)
    case "lastAction":
      return facts.lastAction?.key ? answer({
        ...facts.lastAction
      }) : answer(null, true)
    case "marks":
      return answer(marksCount(facts.marks))
    case "silentNearby":
      return typeof facts.silentNearby === "number" ? answer(facts.silentNearby) : answer(null, true)
    default: {
    // The gamemaster's entries: what she typed, or what a provider answered (sr5.matrixPerceptionInfo)
      const text = String(typed?.[key] ?? "").trim()
      return text ? answer(text) : answer(null, true)
    }
  }
}

/** The number of marks on an icon, whoever placed them (SR5 p. 237: "but not their owners") */
export function marksCount(marks = []){
  return (Array.isArray(marks) ? marks : []).reduce((total, m) => total + Math.max(0, Number(m?.value) || 0), 0)
}

// The key of an icon in the register: a uuid holds dots, which an update of a document would read as a path
export function intelKey(uuid){
  return String(uuid ?? "").replace(/\./g, "_")
}

/** What the register holds about an icon, or null */
export function intelFor(intel, uuid){
  if (!intel || !uuid) return null
  return intel[intelKey(uuid)] ?? null
}

/**
 * The entry of the register after a Matrix Perception on a target: spotted (SR5 p. 237: any answer spots it), and
 * what the crown draws (the monitor, the number of marks). What it already knew stays unless it is asked again.
 * @param {Object|null} previous    the entry before
 * @param {Array} answers           answerOf for each choice
 * @param {Object} about            {uuid, holder: the uuid of the actor that carries the icon, name, time}
 */
export function intelEntry(previous, answers = [], {
  uuid, holder, name = "", time = 0
} = {
}){
  const entry = {
    ...(previous ?? {
    }), uuid, holder, name, spotted: true, time
  }
  for (const answer of answers){
    if (answer.missing) continue
    if (answer.key === "monitor") entry.monitor = answer.value
    if (answer.key === "marks") entry.marks = answer.value
  }
  return entry
}

/**
 * The update that turns a register into another: keys gone are deleted ("-="), the others written whole.
 * @return {Object|null}  the update for Document#update, or null when nothing changes
 */
export function intelUpdateData(before = {
}, after = {
}){
  const data = {
  }
  for (const key of Object.keys(before ?? {
  })) if (!(key in (after ?? {
  }))) data[`flags.sr5.matrixIntel.-=${key}`] = null
  for (const [key, value] of Object.entries(after ?? {
  })){
    if (JSON.stringify(before?.[key]) !== JSON.stringify(value)) data[`flags.sr5.matrixIntel.${key}`] = value
  }
  return Object.keys(data).length ? data : null
}

/**
 * The register without what it knew of an actor's icons: the actor rebooted or jacked out, or beat the observer with
 * Hide (SR5 p. 236).
 * @param {Object} intel     the register
 * @param {String} holder    the uuid of the actor
 */
export function forgetHolder(intel = {
}, holder){
  return Object.fromEntries(Object.entries(intel ?? {
  }).filter(([, entry]) => entry?.holder !== holder))
}

/** The uuids the register holds as spotted, for the visibility of the crown (pan-visibility.js) */
export function spottedUuids(intel = {
}){
  return Object.values(intel ?? {
  }).filter(entry => entry?.spotted && entry.uuid).map(entry => entry.uuid)
}

/**
 * The silent icons around an observer (SR5 p. 236: a query asks the number of icons around, within 100 m), from the
 * nodes of the crowns of the scene, with their distance to the observer's antenna.
 * @param {Array} nodes      [{mode, distance, ownerIds}]
 * @param {Array} viewerIds  the observer's ids: her own icons do not count
 * @param {Number} range     meters
 */
export function silentAround(nodes = [], viewerIds = [], range = 100){
  return nodes.filter(n => n?.mode === "silent" && typeof n.distance === "number" && n.distance <= range &&
    !(n.ownerIds ?? []).some(id => viewerIds.includes(id))).length
}
