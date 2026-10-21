// The threshold of the convergence and its notice (pack 5 of DjamZ, § 3: « réglage du seuil de Convergence ; c'est pas
// possible de coder la Convergence ? »).
// - SR5 p. 233 and Kill Code p. 35: when the Overwatch Score reaches 40, the grid converges. The world setting
//   sr5ConvergenceThreshold holds that 40 by default; another value is the gamemaster's house rule.
// - Data Trails p. 53, quality Wanted by GOD (VF « Recherché par DIEU »): the convergence comes at 30 instead of 40. With
//   another threshold, a reading: 10 below it. Known by its name, FR or VO, as no compendium gives it a key.
// - The system tells the gamemaster the crossing with a card « Appliquer la convergence » (game.sr5.matrix.converge);
//   it never converges alone, for a score raised by mistake cannot be brought down (overwatch-guard.js). The module
//   Matrice tells it itself when it is active: the system then stays silent.
// Pure rules first, with no Foundry in them, so that tests can read them.

// SR5 p. 233, Kill Code p. 35
export const BOOK_CONVERGENCE = 40
// Data Trails p. 53: 30 instead of 40
export const WANTED_BY_GOD_DROP = 10
export const CONVERGENCE_SETTING = "sr5ConvergenceThreshold"
export const MATRICE_MODULE = "matrice-sr5"

const WANTED_BY_GOD = /^(recherch[ée] par (le )?dieu|wanted by (the )?god)$/i

/** A whole number, never below 0, as the system holds the score */
export function scoreOf(value){
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** The threshold a setting value gives: a whole number of at least 1, else the book's 40 */
export function thresholdOf(value){
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 ? n : BOOK_CONVERGENCE
}

/** The quality Wanted by GOD (Data Trails p. 53), active */
export function isWantedByGod(item){
  return item?.type === "itemQuality" && item.system?.isActive !== false && WANTED_BY_GOD.test((item.name ?? "").trim())
}

/**
 * The score at which the grid converges on this actor: the world's threshold, 10 lower for Wanted by GOD (DT p. 53)
 * @param {Object} actor
 * @param {Number} [base]   the world's threshold (sr5ConvergenceThreshold)
 */
export function convergenceThreshold(actor, base = worldThreshold()){
  const threshold = thresholdOf(base)
  if (![...(actor?.items ?? [])].some(isWantedByGod)) return threshold
  return Math.max(1, threshold - WANTED_BY_GOD_DROP)
}

/** Does this rise reach the convergence? Told once, until a reboot brings the score back under */
export function crossesConvergence(before, after, threshold){
  const t = thresholdOf(threshold)
  return scoreOf(before) < t && scoreOf(after) >= t
}

/**
 * Is the convergence a card told still to apply when the gamemaster clicks? The persona may have rebooted or jacked out
 * (score back to 0, SR5 p. 244), turned its last device off (arbitrage de DjamZ du 08/10 : hors de la Matrice, pas de
 * convergence), or moved in or out of a host. A forced convergence (critical glitch of Redefine Ownership, DT p. 161)
 * does not wait on the score.
 * @return {{ok: Boolean, reason: "offline"|"below"|"moved"|null}}
 */
export function convergenceStillDue({
  connected = true, score = 0, threshold = BOOK_CONVERGENCE, forced = false, hostThen = null, hostNow = null
} = {
}){
  if (!connected) return {
    ok: false, reason: "offline"
  }
  if (!forced && scoreOf(score) < thresholdOf(threshold)) return {
    ok: false, reason: "below"
  }
  if ((hostThen || null) !== (hostNow || null)) return {
    ok: false, reason: "moved"
  }
  return {
    ok: true, reason: null
  }
}

/**
 * The lines of the card, [key, data] each: what the convergence will do, then what stays the gamemaster's to play
 * (SR5 p. 233, 249; KC p. 33, 35; DT p. 53, 157)
 */
export function noticeLines({
  name, score, threshold, host = null, forced = false, stealth = false, sprite = false, ai = false, wanted = false
}){
  const lines = [forced ? ["SR5.ConvergenceNoticeForced", {
    name
  }] : ["SR5.ConvergenceNoticeReached", {
    name, score, threshold
  }]]
  if (sprite) lines.push(["SR5.MatrixConvergenceSprite"])
  else if (host) lines.push(["SR5.ConvergenceNoticeHost", {
    host
  }])
  else lines.push(["SR5.ConvergenceNoticeGrid"])
  if (!host) lines.push([stealth ? "SR5.MatrixConvergenceStealth" : "SR5.ConvergenceNoticeSecurity"])
  if (wanted && !host) lines.push(["SR5.ConvergenceNoticeWanted"])
  if (ai) lines.push(["SR5.ConvergenceNoticeAI"])
  return lines
}

/* -------------------------------------------- */
/*  In Foundry                                   */
/* -------------------------------------------- */

/** The world's threshold; the book's 40 before the settings are read */
export function worldThreshold(){
  try {
    return thresholdOf(game.settings.get("sr5", CONVERGENCE_SETTING))
  } catch {
    return BOOK_CONVERGENCE
  }
}

/** The module Matrice tells the convergence itself (tracks.mjs) */
const matriceActive = () => !!game.modules?.get?.(MATRICE_MODULE)?.active
const isActiveGM = () => !!game.user?.isGM && game.users?.activeGM?.id === game.user.id
const esc = s => foundry.utils.escapeHTML(String(s ?? ""))
const nameOf = actor => actor?.isToken ? actor.token?.name ?? actor.name : actor?.name

/** Holds an Overwatch Score: the decker, the technomancer, the AI (not a host, nor an IC) */
const holdsOverwatch = actor => actor?.system?.matrix?.overwatchScore !== undefined && actor.type !== "actorDevice"

/**
 * Whisper the card of the convergence to the gamemasters, with its button
 * @param {Object} actor
 * @param {{forced: Boolean}} [options]   forced: a critical glitch of Redefine Ownership (DT p. 161)
 */
export async function postConvergenceNotice(actor, {
  forced = false
} = {
}){
  if (!actor) return null
  const {
    isConnectedPersona
  } = await import("./matrix-api.js")
  if (!isConnectedPersona(actor)) return null
  const hostUuid = actor.system?.matrix?.currentHost || null
  const host = hostUuid ? await fromUuid(hostUuid) : null
  const threshold = convergenceThreshold(actor)
  const lines = noticeLines({
    name: esc(nameOf(actor)), score: scoreOf(actor.system?.matrix?.overwatchScore), threshold,
    host: host ? esc(nameOf(host.actor ?? host)) : null, forced,
    stealth: !!actor.system?.matrix?.programs?.sneak?.isActive, sprite: actor.type === "actorSprite",
    ai: actor.system?.activeSpecialAttribute === "depth", wanted: [...(actor.items ?? [])].some(isWantedByGod),
  }).map(([key, data]) => data ? game.i18n.format(key, data) : game.i18n.localize(key))
  const button = `<button type="button" class="sr5-convergence-apply">${esc(game.i18n.localize("SR5.ConvergenceApply"))}</button>`
  return ChatMessage.create({
    speaker: {
      alias: game.i18n.localize("SR5.MatrixConvergence")
    },
    content: `<div class="sr5-convergence-notice"><h3>${esc(game.i18n.localize("SR5.MatrixConvergence"))}</h3>${lines.map(l => `<p>${l}</p>`).join("")}${button}</div>`,
    whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: {
      sr5: {
        convergence: {
          actorUuid: actor.uuid, hostUuid, forced, applied: false
        }
      }
    },
  })
}

/** « Appliquer la convergence »: the system converges (matrix-api.js), once, if it is still due */
export async function applyConvergenceNotice(message){
  const data = message?.flags?.sr5?.convergence
  if (!game.user?.isGM || !data || data.applied) return false
  const actor = await fromUuid(data.actorUuid)
  const persona = actor?.documentName === "Token" ? actor.actor : actor
  if (!persona) return false
  const {
    isConnectedPersona, converge
  } = await import("./matrix-api.js")
  const due = convergenceStillDue({
    connected: isConnectedPersona(persona), score: persona.system?.matrix?.overwatchScore,
    threshold: convergenceThreshold(persona), forced: !!data.forced,
    hostThen: data.hostUuid, hostNow: persona.system?.matrix?.currentHost || null,
  })
  if (!due.ok) {
    ui.notifications.warn(game.i18n.format(`SR5.ConvergenceRefused_${due.reason}`, {
      name: nameOf(persona)
    }))
    return false
  }
  await message.update({
    "flags.sr5.convergence.applied": true
  })
  return (await converge(persona, data.hostUuid ? {
    host: data.hostUuid
  } : {
  })) === true
}

/** The button: the gamemasters only; « Convergence appliquée » once done */
export function onRenderConvergenceNotice(message, html){
  const data = message?.flags?.sr5?.convergence
  const button = data && html?.querySelector?.(".sr5-convergence-apply")
  if (!button) return
  if (!game.user?.isGM) return void button.remove()
  if (data.applied) {
    button.disabled = true
    button.textContent = game.i18n.localize("SR5.ConvergenceApplied")
    return
  }
  button.addEventListener("click", event => {
    event.preventDefault()
    button.disabled = true
    applyConvergenceNotice(message).finally(() => {
      if (!message.flags?.sr5?.convergence?.applied) button.disabled = false
    })
  })
}

// The score each actor was last seen at, on the gamemasters' browsers: a change written elsewhere is compared to it
const lastSeen = new Map()
const keyOf = actor => actor?.uuid ?? null

/**
 * The crossing of the threshold, told by the active gamemaster: a rise of the score (SR5 p. 233), or a persona offline
 * at the threshold or more that comes back on the Matrix (« dès qu'un personnage pointe le bout de son nez matriciel
 * dans une grille »). Silent while the module Matrice is active, which tells it itself.
 */
export function registerConvergenceWatch(){
  Hooks.once("ready", () => {
    if (!game.user?.isGM) return
    for (const actor of game.actors ?? []) if (holdsOverwatch(actor)) lastSeen.set(keyOf(actor), scoreOf(actor.system.matrix.overwatchScore))
  })
  Hooks.on("updateActor", async (actor, changes, options) => {
    if (!game.user?.isGM || !holdsOverwatch(actor)) return
    const {
      overwatchInChanges
    } = await import("./matrix-hooks.js")
    if (overwatchInChanges(changes) === undefined) return
    const after = scoreOf(actor.system.matrix.overwatchScore), key = keyOf(actor)
    // The writer's browser knows the score before (matrix-hooks.js); another one compares to its memory
    const before = options?.sr5OverwatchPrevious ?? (lastSeen.has(key) ? lastSeen.get(key) : after)
    lastSeen.set(key, after)
    if (!isActiveGM() || matriceActive()) return
    if (crossesConvergence(before, after, convergenceThreshold(actor))) await postConvergenceNotice(actor)
  })
  Hooks.on("updateItem", async (item, changes) => {
    if (item?.type !== "itemDevice" || foundry.utils.getProperty(changes, "system.isActive") !== true) return
    const actor = item.parent
    if (!isActiveGM() || matriceActive() || !holdsOverwatch(actor)) return
    const others = [...(actor.items ?? [])].filter(i => i.id !== item.id)
    const wasConnected = actor.system?.activeSpecialAttribute === "depth" || others.some(i => i.type === "itemDevice" && i.system?.isActive)
    if (wasConnected || scoreOf(actor.system.matrix.overwatchScore) < convergenceThreshold(actor)) return
    await postConvergenceNotice(actor)
  })
}
