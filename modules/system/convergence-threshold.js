// The threshold of the convergence and its notice (pack 5 of DjamZ, § 3: « réglage du seuil de Convergence ; c'est pas
// possible de coder la Convergence ? »).
// - SR5 p. 233 and Kill Code p. 35: when the Overwatch Score reaches 40, the grid converges. The world setting
//   sr5ConvergenceThreshold holds that 40 by default; another value is the gamemaster's house rule.
// - Data Trails p. 53, quality Wanted by GOD (VF « Recherché par DIEU »): the convergence comes at 30 instead of 40. With
//   another threshold, a reading: 10 below it. Known by its name, FR or VO, as no compendium gives it a key.
// - The system tells the gamemaster the crossing with a card « Appliquer la convergence » (game.sr5.matrix.converge);
//   it never converges alone, for a score raised by mistake cannot be brought down (overwatch-guard.js). The module
//   Matrice tells it itself when it is active: the system then stays silent.
// - The card is always written by the active gamemaster's browser (relecture du 21/10, D5): a whisper's author reads
//   it, so a card written by a player's browser showed them the lines kept for the gamemaster. Any other browser
//   leaves it pending on the actor (flags.sr5.convergencePending, written by the actor's owner): the active gamemaster
//   posts it at once, or at their return (ready) when none was connected, and clears the flag.
// Pure rules first, with no Foundry in them, so that tests can read them.

// SR5 p. 233, Kill Code p. 35
export const BOOK_CONVERGENCE = 40
// Data Trails p. 53: 30 instead of 40
export const WANTED_BY_GOD_DROP = 10
export const CONVERGENCE_SETTING = "sr5ConvergenceThreshold"
export const MATRICE_MODULE = "matrice-sr5"

export const CONVERGENCE_PENDING_FLAG = "convergencePending"

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

/**
 * Who tells the card of a convergence, on this browser: the active gamemaster posts it ("post"); the browser that wrote
 * the change leaves it pending on the actor when no gamemaster is connected ("defer"); any other: nothing (null).
 * Nobody while the module Matrice is active, which tells it itself.
 */
export function convergenceTeller({
  activeGM = false, gmConnected = false, writer = false, matrice = false
} = {
}){
  if (matrice) return null
  if (activeGM) return "post"
  return !gmConnected && writer ? "defer" : null
}

/** The card left pending on an actor, merged with the one already there: a forced one stays forced */
export function mergePending(previous, next){
  return {
    forced: !!previous?.forced || !!next?.forced
  }
}

/** The pending card an update writes, or null (its removal, "-=convergencePending", is none) */
export function pendingIn(changes){
  const value = changes?.flags?.sr5?.[CONVERGENCE_PENDING_FLAG] ?? changes?.[`flags.sr5.${CONVERGENCE_PENDING_FLAG}`]
  return value && typeof value === "object" ? value : null
}

/**
 * Is a pending card still worth posting when the gamemaster comes? A forced one always; a crossing only while the score
 * is still at the threshold or more (a reboot in between brought it back under, SR5 p. 244)
 */
export function pendingStillDue(pending, score, threshold){
  if (!pending) return false
  return !!pending.forced || scoreOf(score) >= thresholdOf(threshold)
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
    content: `<div class="sr5-convergence-notice">${lines.map(l => `<p>${l}</p>`).join("")}${button}</div>`,
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

/** Leave the card pending on the actor, for the active gamemaster to post (now, or at their return) */
export async function deferConvergenceNotice(actor, {
  forced = false
} = {
}){
  try {
    return await actor.update({
      [`flags.sr5.${CONVERGENCE_PENDING_FLAG}`]: mergePending(actor.flags?.sr5?.[CONVERGENCE_PENDING_FLAG], {
        forced
      })
    })
  } catch (error) {
    console.error("SR5 | convergence: the card could not be left pending", error)
    return null
  }
}

/**
 * Ask for the card of the convergence from any browser: the active gamemaster posts it, any other leaves it pending
 * (a forced one, critical glitch of Redefine Ownership, is rolled on the player's browser). Silent with Matrice.
 */
export async function requestConvergenceNotice(actor, {
  forced = false
} = {
}){
  if (!actor || matriceActive()) return null
  if (isActiveGM()) return postConvergenceNotice(actor, {
    forced
  })
  return deferConvergenceNotice(actor, {
    forced
  })
}

/** The active gamemaster posts the card pending on an actor, once: the flag is cleared first */
export async function postPendingNotice(actor){
  const pending = actor?.flags?.sr5?.[CONVERGENCE_PENDING_FLAG]
  if (!pending || !isActiveGM()) return null
  await actor.update({
    [`flags.sr5.-=${CONVERGENCE_PENDING_FLAG}`]: null
  })
  if (matriceActive() || !pendingStillDue(pending, actor.system?.matrix?.overwatchScore, convergenceThreshold(actor))) return null
  return postConvergenceNotice(actor, {
    forced: !!pending.forced
  })
}

/** The actors with a card pending: the world's, and the unlinked tokens of every scene */
function actorsWithPending(){
  const out = [...(game.actors ?? [])].filter(a => a.flags?.sr5?.[CONVERGENCE_PENDING_FLAG])
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) {
    if (!token.actorLink && token.delta?.flags?.sr5?.[CONVERGENCE_PENDING_FLAG] && token.actor) out.push(token.actor)
  }
  return out
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
  try {
    return (await converge(persona, data.hostUuid ? {
      host: data.hostUuid
    } : {
    })) === true
  } catch (error) {
    // Nothing was done: the card must not say « appliquée »
    console.error("SR5 | convergence failed", error)
    await message.update({
      "flags.sr5.convergence.applied": false
    })
    return false
  }
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
 * dans une grille »). With no gamemaster connected, the browser that wrote the change leaves the card pending, posted at
 * the gamemaster's return. Silent while the module Matrice is active, which tells it itself.
 */
export function registerConvergenceWatch(){
  const teller = userId => convergenceTeller({
    activeGM: isActiveGM(), gmConnected: !!game.users?.activeGM, writer: userId === game.user?.id, matrice: matriceActive(),
  })
  Hooks.once("ready", async () => {
    if (!game.user?.isGM) return
    for (const actor of game.actors ?? []) if (holdsOverwatch(actor)) lastSeen.set(keyOf(actor), scoreOf(actor.system.matrix.overwatchScore))
    // The cards left pending while no gamemaster was connected
    if (!isActiveGM()) return
    for (const actor of actorsWithPending()) await postPendingNotice(actor)
  })
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (!holdsOverwatch(actor)) return
    if (pendingIn(changes)) {
      if (isActiveGM() && !matriceActive()) await postPendingNotice(actor)
      return
    }
    const {
      overwatchInChanges
    } = await import("./matrix-hooks.js")
    if (overwatchInChanges(changes) === undefined) return
    const after = scoreOf(actor.system.matrix.overwatchScore), key = keyOf(actor)
    // The writer's browser knows the score before (matrix-hooks.js); a gamemaster's compares to its memory
    const before = options?.sr5OverwatchPrevious ?? (game.user?.isGM && lastSeen.has(key) ? lastSeen.get(key) : after)
    if (game.user?.isGM) lastSeen.set(key, after)
    const who = teller(userId)
    if (!who || !crossesConvergence(before, after, convergenceThreshold(actor))) return
    if (who === "post") await postConvergenceNotice(actor)
    else await deferConvergenceNotice(actor)
  })
  Hooks.on("updateItem", async (item, changes, options, userId) => {
    if (item?.type !== "itemDevice" || foundry.utils.getProperty(changes, "system.isActive") !== true) return
    const actor = item.parent
    const who = teller(userId)
    if (!who || matriceActive() || !holdsOverwatch(actor)) return
    const others = [...(actor.items ?? [])].filter(i => i.id !== item.id)
    const wasConnected = actor.system?.activeSpecialAttribute === "depth" || others.some(i => i.type === "itemDevice" && i.system?.isActive)
    if (wasConnected || scoreOf(actor.system.matrix.overwatchScore) < convergenceThreshold(actor)) return
    if (who === "post") await postConvergenceNotice(actor)
    else await deferConvergenceNotice(actor)
  })
}
