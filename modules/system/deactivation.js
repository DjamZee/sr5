// Defragmentation echo and the Deactivation resonance action (Dark Terrors p. 89-90): a technomancer with the echo
// forces an AI or a Monad out of its biological host or of its home device.
// - Test: Charisma + Willpower, or, with the Decompiling skill, Decompiling + Resonance + Willpower. The book gives
//   no limit: the Decompiling test is "the usual one", Decompile Sprite is [Social] (SR5 p. 252), hence [Social], and
//   the same for Charisma + Willpower (arbitrage de DjamZ, 2026-10-06).
// - The AI resists with Depth x 2, the Monad with Matrix Entity Concentration (MEC) x 2.
// - Net hits equal to the Depth or the MEC: the digital intelligence is expelled and flees into the Matrix.
// - Fading: 2 per hit of the target (not only the net ones), at least 2.
// The player of the technomancer rolls the test, Edge included (arbitrage de DjamZ, 2026-10-06), from the sheet; the
// card goes to the GM, who counts the hits again within the pool he works out himself from the sheet (+ Edge when
// the player pushed the limit), confirms them, and only then rolls the resistance and applies the result. Nothing a
// player writes on a card or a flag counts beyond that bound. The GM can also run the action for a GM's character.
// The expulsion itself is left to the GM: the card says it, the sheet is untouched.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  contentWithRowDone, cardFromGM
} from "./card-rows.js"

export const DEFRAG_ECHO = /d[ée]frag/i

/* -------------------------------------------- */
/* Rules                                        */
/* -------------------------------------------- */

const num = (v) => Number(v) || 0
const aug = (actor, path) => num(path.split(".").reduce((o, k) => o?.[k], actor?.system)?.augmented?.value)

export function hasDefragmentation(actor){
  return !!actor?.items?.some?.(i => i.type === "itemEcho" && DEFRAG_ECHO.test(i.name ?? ""))
}

// What can be deactivated: an AI (Depth active) or a Monad (Nanite Volume active)
export function targetKind(actor){
  if (!["actorPc", "actorGrunt"].includes(actor?.type)) return null
  const active = actor.system?.activeSpecialAttribute
  if (active === "depth") return "ai"
  if (active === "nanite") return "monad"
  return null
}

// The Depth of an AI, the MEC of a Monad: the resistance is twice it, the net hits needed are it
export function targetStrength(actor){
  const kind = targetKind(actor)
  if (kind === "ai") return aug(actor, "specialAttributes.depth")
  if (kind === "monad") return aug(actor, "specialAttributes.cem")
  return 0
}

export function decompilingRating(actor){
  return num(actor?.system?.skills?.decompiling?.rating?.value)
}

// The wound and other penalties of the technomancer, as the roll dialog counts them (negative or 0)
export function penaltiesOf(actor){
  const p = actor?.system?.penalties ?? {
  }
  return ["condition", "matrix", "magic", "special"].reduce((s, k) => s + num(p[k]?.actual?.value), 0)
}

// The technomancer's pool, worked out from the sheet. method: "decompiling" or "charisma"; the Decompiling test needs
// the skill. modifier: what the GM adds or takes away (hot sim, situation)
export function deactivationPool(actor, method, modifier = 0){
  const willpower = aug(actor, "attributes.willpower")
  const parts = method === "decompiling" ?
    {
      decompiling: decompilingRating(actor), resonance: aug(actor, "specialAttributes.resonance"), willpower
    } :
    {
      charisma: aug(actor, "attributes.charisma"), willpower
    }
  const penalties = penaltiesOf(actor)
  const dicePool = Math.max(0, Object.values(parts).reduce((s, v) => s + v, 0) + penalties + num(modifier))
  return {
    parts, penalties, modifier: num(modifier), dicePool, limit: num(actor?.system?.limits?.socialLimit?.value)
  }
}

// The larger pool; the Decompiling test only with the skill
export function bestMethod(actor){
  if (decompilingRating(actor) <= 0) return "charisma"
  return deactivationPool(actor, "decompiling").dicePool >= deactivationPool(actor, "charisma").dicePool ? "decompiling" : "charisma"
}

// The outcome of the opposed test
export function resolveDeactivation(ownHits, targetHits, strength){
  const own = Math.max(0, num(ownHits))
  const target = Math.max(0, num(targetHits))
  const net = own - target
  return {
    own, target, net, expelled: net > 0 && net >= num(strength), fading: deactivationFading(target)
  }
}

// 2 Fading per hit of the target, at least 2 (DTER p. 90)
export function deactivationFading(targetHits){
  return Math.max(2, 2 * Math.max(0, num(targetHits)))
}

// The Edge points the character has left to spend
export function edgeLeft(actor){
  const max = aug(actor, "specialAttributes.edge")
  const spent = num(actor?.system?.conditionMonitors?.edge?.actual?.value)
  return Math.max(0, max - spent)
}

// The pool the GM works out for a player's roll: the test from the sheet, the modifier he keeps, and the Edge rating
// when the player pushed the limit (SR5 p. 58: Edge dice added, the 6s explode, limit ignored)
export function gmPool(actor, method, modifier, pushed){
  const pool = deactivationPool(actor, method, modifier)
  const edge = pushed ? aug(actor, "specialAttributes.edge") : 0
  return {
    ...pool, edge, dicePool: pool.dicePool + edge, limit: pushed ? null : pool.limit
  }
}

// The most hits the GM can believe: the limit without Edge. With Edge the 6s explode: the pool plus the Edge rating
// again leaves room for the rerolls of a small pool, and a forged card no room to speak of (more hits than dice from
// exploding 6s is all but impossible past a few dice). The GM can always count fewer
export function hitsCap(pool){
  const dice = Math.max(0, num(pool?.dicePool))
  return pool?.limit ? Math.min(dice, num(pool.limit)) : dice + Math.max(0, num(pool?.edge))
}

export function boundHits(announced, pool){
  return Math.max(0, Math.min(Math.floor(num(announced)), hitsCap(pool)))
}

// Physical when the Depth or the MEC is above the technomancer's Resonance. The book says nothing: by analogy with
// Decompile Sprite, whose Fading is physical when the sprite's Level is above Resonance (SR5 p. 254), kept by DjamZ
// (arbitrage de DjamZ, 2026-10-06). The system's Fading test does the comparison itself from matrix.fadingLevel
export function fadingIsPhysical(strength, resonance){
  return num(strength) > num(resonance)
}

/* -------------------------------------------- */
/* Foundry                                      */
/* -------------------------------------------- */

function isActiveGM(){
  return game.user.isGM && game.users.activeGM?.id === game.user.id
}

const gmIds = () => ChatMessage.getWhisperRecipients("GM").map(u => u.id)

function escape(text){
  return foundry.utils.escapeHTML?.(String(text ?? "")) ?? String(text ?? "")
}

async function rollPool(dicePool, limit, explose = false){
  if (dicePool <= 0) return {
    hits: 0, dices: []
  }
  //Dynamic import: the roll pipeline loads the whole system, which this module must not need to be tested
  const {
    SR5_RollTest
  } = await import("../rolls/roll-test.js")
  return SR5_RollTest.rollDice({
    dicePool, limit, explose, edgeRoll: explose
  })
}

const diceText = (roll) => (roll.dices ?? []).map(d => d.result).join(", ")

// A glitch or a critical glitch on a roll of the card, as the system's dice tell it
export function glitchKey(roll){
  if (roll?.criticalGlitchRoll) return "SR5.DEFRAG_CriticalGlitch"
  if (roll?.glitchRoll) return "SR5.DEFRAG_Glitch"
  return null
}

function glitchText(roll){
  const key = glitchKey(roll)
  return key ? ` <strong>${game.i18n.localize(key)}</strong>` : ""
}

// The GM sees the link on the sheet of an AI or a Monad, to run the action for a GM's technomancer
export function deactivationStatus(actor){
  if (!game.user.isGM) return null
  const kind = targetKind(actor)
  if (!kind) return null
  return {
    kind, strength: targetStrength(actor)
  }
}

// The owner of a technomancer with the echo sees the link on its sheet
export function deactivationLauncher(actor){
  if (!actor?.isOwner || !hasDefragmentation(actor)) return null
  return {
    edge: edgeLeft(actor)
  }
}

// The technomancers of the world who bear the echo: the characters the GM can see
function technomancers(){
  return (game.actors?.contents ?? []).filter(a => ["actorPc", "actorGrunt"].includes(a.type) && hasDefragmentation(a))
}

const testLabelOf = (method) => game.i18n.localize(method === "decompiling" ? "SR5.DEFRAG_TestDecompiling" : "SR5.DEFRAG_TestCharisma")
const limitText = (limit) => limit ? game.i18n.format("SR5.DEFRAG_LimitSocial", {
  limit
}) : game.i18n.localize("SR5.DEFRAG_NoLimit")

function methodField(){
  return `<div class="form-group"><label>${game.i18n.localize("SR5.DEFRAG_Test")}</label>
      <select name="method">
        <option value="auto">${game.i18n.localize("SR5.DEFRAG_TestBest")}</option>
        <option value="decompiling">${game.i18n.localize("SR5.DEFRAG_TestDecompiling")}</option>
        <option value="charisma">${game.i18n.localize("SR5.DEFRAG_TestCharisma")}</option>
      </select></div>
    <div class="form-group"><label>${game.i18n.localize("SR5.DEFRAG_Modifier")}</label>
      <input type="number" name="modifier" value="0" step="1"></div>`
}

function methodFor(actor, method){
  const m = method === "auto" || !method ? bestMethod(actor) : method
  return m === "decompiling" && decompilingRating(actor) <= 0 ? "charisma" : m
}

/* The GM's technomancer -------------------------- */

export async function deactivationDialog(target){
  if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_ActiveGMOnly"))
  const kind = targetKind(target)
  if (!kind) return
  const strength = targetStrength(target)
  if (strength <= 0) return ui.notifications.warn(game.i18n.localize(kind === "monad" ? "SR5.DEFRAG_NoCem" : "SR5.DEFRAG_NoDepth"))
  const tms = technomancers().filter(a => a.uuid !== target.uuid)
  if (!tms.length) return ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_NoTechnomancer"))
  const options = tms.map(a => `<option value="${escape(a.uuid)}">${escape(a.name)}</option>`).join("")
  const content = `<div class="sr5-defrag-dialog">
    <p>${game.i18n.format("SR5.DEFRAG_DialogIntro", {
    target: escape(target.name), strength
  })}</p>
    <div class="form-group"><label>${game.i18n.localize("SR5.DEFRAG_Technomancer")}</label>
      <select name="tm">${options}</select></div>
    ${methodField()}
    <p class="notes">${game.i18n.localize("SR5.DEFRAG_GMRolls")}</p>
    <p class="notes">${game.i18n.localize("SR5.DEFRAG_Connection")}</p>
  </div>`
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.localize("SR5.DEFRAG_Title")
    },
    content,
    ok: {
      label: game.i18n.localize("SR5.DEFRAG_Roll"),
      callback: (event, button) => ({
        tm: button.form.elements.tm.value,
        method: button.form.elements.method.value,
        modifier: Number(button.form.elements.modifier.value) || 0,
      })
    },
    rejectClose: false,
  })
  if (!data) return
  return runDeactivation(target, data)
}

export async function runDeactivation(target, {
  tm: tmUuid, method, modifier
}){
  if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_ActiveGMOnly"))
  const tm = await fromUuid(tmUuid)
  const kind = targetKind(target)
  // Read again from the sheets at the moment of the roll: the echo, the kind and the strength
  if (!tm || !hasDefragmentation(tm) || !kind) return ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_NoTechnomancer"))
  const strength = targetStrength(target)
  if (strength <= 0) return ui.notifications.warn(game.i18n.localize(kind === "monad" ? "SR5.DEFRAG_NoCem" : "SR5.DEFRAG_NoDepth"))
  const m = methodFor(tm, method)
  const pool = deactivationPool(tm, m, modifier)
  const own = await rollPool(pool.dicePool, pool.limit || undefined)
  const ownRow = game.i18n.format("SR5.DEFRAG_OwnRoll", {
    tm: escape(tm.name), test: testLabelOf(m), pool: pool.dicePool, limit: limitText(pool.limit), dice: diceText(own), hits: own.hits ?? 0
  }) + glitchText(own)
  return resolveAgainst({
    target, tm, kind, strength, ownHits: own.hits ?? 0, ownRow
  })
}

// The resistance of the target, rolled by the GM, and the card that tells the outcome and offers the Fading test
async function resolveAgainst({
  target, tm, kind, strength, ownHits, ownRow, requestId = null
}){
  const res = await rollPool(strength * 2)
  const out = resolveDeactivation(ownHits, res.hits, strength)
  const physical = fadingIsPhysical(strength, aug(tm, "specialAttributes.resonance"))
  const strengthLabel = game.i18n.localize(kind === "monad" ? "SR5.DEFRAG_Cem" : "SR5.Depth")
  const net = Math.max(0, out.net)
  const rows = [
    ownRow,
    game.i18n.format("SR5.DEFRAG_TargetRoll", {
      target: escape(target.name), label: strengthLabel, strength, pool: strength * 2, dice: diceText(res), hits: res.hits ?? 0
    }) + glitchText(res),
    `<strong>${game.i18n.format(out.expelled ? "SR5.DEFRAG_Expelled" : "SR5.DEFRAG_Failed", {
      target: escape(target.name), net, needed: strength, s: net > 1 ? "s" : ""
    })}</strong>`,
  ]
  if (out.expelled && kind === "ai") rows.push(game.i18n.localize("SR5.DEFRAG_ExpelledAI"))
  const fadingText = game.i18n.format("SR5.DEFRAG_Fading", {
    value: out.fading, type: game.i18n.localize(physical ? "SR5.DEFRAG_Physical" : "SR5.DEFRAG_Stun")
  })
  await ChatMessage.create({
    content: `<div class="sr5-defrag-card"><h3>${game.i18n.localize("SR5.DEFRAG_Title")}</h3><ul>
      ${rows.map(r => `<li>${r}</li>`).join("")}
      <li class="sr5-defrag-row" data-defrag-fading="1"><span>${fadingText}</span>
        <button type="button" data-sr5-defrag="fading">${game.i18n.localize("SR5.DEFRAG_ResistFading")}</button></li>
    </ul></div>`,
    whisper: gmIds(),
    flags: {
      sr5: {
        deactivation: {
          tmUuid: tm.uuid, fading: out.fading, strength, requestId
        }
      }
    },
  })
}

/* The player's technomancer ---------------------- */

// The target is the token the player targets, as for any action on another character
function userTarget(){
  return [...(game.user.targets ?? [])][0]?.actor ?? null
}

export async function launchDeactivation(tm){
  if (!tm?.isOwner || !hasDefragmentation(tm)) return ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_NoEcho"))
  const target = userTarget()
  if (!target || target.uuid === tm.uuid) return ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_NoTarget"))
  const edge = edgeLeft(tm)
  const content = `<div class="sr5-defrag-dialog">
    <p>${game.i18n.format("SR5.DEFRAG_LaunchIntro", {
    target: escape(target.name)
  })}</p>
    ${methodField()}
    <div class="form-group"><label>${game.i18n.format("SR5.DEFRAG_Push", {
    n: edge
  })}</label>
      <input type="checkbox" name="push"${edge > 0 ? "" : " disabled"}></div>
    <p class="notes">${game.i18n.localize("SR5.DEFRAG_Connection")}</p>
  </div>`
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.localize("SR5.DEFRAG_Title")
    },
    content,
    ok: {
      label: game.i18n.localize("SR5.DEFRAG_Roll"),
      callback: (event, button) => ({
        method: button.form.elements.method.value,
        modifier: Number(button.form.elements.modifier.value) || 0,
        push: !!button.form.elements.push.checked,
      })
    },
    rejectClose: false,
  })
  if (!data) return
  const method = methodFor(tm, data.method)
  const pushed = data.push && edgeLeft(tm) > 0
  const pool = gmPool(tm, method, data.modifier, pushed)
  // Pushing the limit spends 1 point of Edge, as the system's own tests do
  if (pushed) await tm.update({
    "system.conditionMonitors.edge.actual.base": (Number(tm.system.conditionMonitors.edge.actual.base) || 0) + 1
  })
  const roll = await rollPool(pool.dicePool, pool.limit || undefined, pushed)
  const row = game.i18n.format("SR5.DEFRAG_OwnRoll", {
    tm: escape(tm.name), test: testLabelOf(method), pool: pool.dicePool, limit: limitText(pool.limit), dice: diceText(roll), hits: roll.hits ?? 0
  }) + (pushed ? ` ${game.i18n.localize("SR5.DEFRAG_Pushed")}` : "") + glitchText(roll)
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({
      actor: tm
    }),
    content: `<div class="sr5-defrag-card"><h3>${game.i18n.localize("SR5.DEFRAG_Title")}</h3><ul>
      <li>${game.i18n.format("SR5.DEFRAG_RequestTarget", {
    target: escape(target.name)
  })}</li>
      <li>${row}</li>
      <li class="sr5-defrag-row" data-defrag-request="1"><span>${game.i18n.localize("SR5.DEFRAG_Waiting")}</span>
        <button type="button" data-sr5-defrag="confirm">${game.i18n.localize("SR5.DEFRAG_Confirm")}</button></li>
    </ul></div>`,
    whisper: [...new Set([...gmIds(), game.user.id])],
    flags: {
      sr5: {
        deactivationRequest: {
          tmUuid: tm.uuid, targetUuid: target.uuid, method, modifier: data.modifier, pushed,
          hits: roll.hits ?? 0, dicePool: pool.dicePool
        }
      }
    },
  })
}

// A request is confirmed once: the GM's own result card keeps the id of the request it answers, and a player cannot
// write a GM's card
export function requestAnswered(requestId, messages){
  return !!requestId && [...(messages ?? [])].some(m => m?.author?.isGM && m.flags?.sr5?.deactivation?.requestId === requestId)
}

// The GM counts the hits again within the pool he works out from the sheet, confirms them, then rolls the resistance
async function confirmRequest(message){
  const req = message.flags?.sr5?.deactivationRequest
  if (!req) return false
  if (requestAnswered(message.id, game.messages?.contents)) {
    ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_AlreadyDone"))
    return true
  }
  const tm = req.tmUuid ? await fromUuid(req.tmUuid) : null
  const target = req.targetUuid ? await fromUuid(req.targetUuid) : null
  if (!tm || !hasDefragmentation(tm)) return void ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_NoTechnomancer"))
  // The card's author must own the technomancer: a player does not roll for another's character
  if (!message.author || !tm.testUserPermission(message.author, "OWNER")) return void ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_NotOwner"))
  const kind = targetKind(target)
  if (!kind) return void ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_NotTarget"))
  const strength = targetStrength(target)
  if (strength <= 0) return void ui.notifications.warn(game.i18n.localize(kind === "monad" ? "SR5.DEFRAG_NoCem" : "SR5.DEFRAG_NoDepth"))
  const method = req.method === "decompiling" && decompilingRating(tm) > 0 ? "decompiling" : "charisma"
  const pushed = !!req.pushed
  const announced = Math.max(0, Math.floor(num(req.hits)))
  const base = gmPool(tm, method, num(req.modifier), pushed)
  const content = `<div class="sr5-defrag-dialog">
    <p>${game.i18n.format("SR5.DEFRAG_ConfirmIntro", {
    tm: escape(tm.name), target: escape(target.name), hits: announced, test: testLabelOf(method),
    modifier: num(req.modifier), pool: base.dicePool, limit: limitText(base.limit), cap: hitsCap(base),
    pushed: pushed ? ` ${game.i18n.localize("SR5.DEFRAG_Pushed")}` : ""
  })}</p>
    <div class="form-group"><label>${game.i18n.localize("SR5.DEFRAG_ModifierKept")}</label>
      <input type="number" name="modifier" value="${num(req.modifier)}" step="1"></div>
    <div class="form-group"><label>${game.i18n.localize("SR5.DEFRAG_HitsKept")}</label>
      <input type="number" name="hits" value="${boundHits(announced, base)}" min="0" step="1"></div>
    <p class="notes">${game.i18n.localize("SR5.DEFRAG_ConfirmNote")}</p>
  </div>`
  const data = await foundry.applications.api.DialogV2.prompt({
    window: {
      title: game.i18n.localize("SR5.DEFRAG_ConfirmTitle")
    },
    content,
    ok: {
      label: game.i18n.localize("SR5.DEFRAG_ConfirmOk"),
      callback: (event, button) => ({
        modifier: Number(button.form.elements.modifier.value) || 0,
        hits: Number(button.form.elements.hits.value) || 0,
      })
    },
    rejectClose: false,
  })
  if (!data) return false
  // Checked again after the dialog: another GM's click, or a second click, may have answered it meanwhile
  if (requestAnswered(message.id, game.messages?.contents)) return true
  const pool = gmPool(tm, method, data.modifier, pushed)
  const hits = boundHits(Math.min(data.hits, announced), pool)
  const ownRow = game.i18n.format("SR5.DEFRAG_Confirmed", {
    tm: escape(tm.name), test: testLabelOf(method), announced, pool: pool.dicePool, limit: limitText(pool.limit), hits,
    pushed: pushed ? ` ${game.i18n.localize("SR5.DEFRAG_Pushed")}` : ""
  })
  await resolveAgainst({
    target, tm, kind, strength, ownHits: hits, ownRow, requestId: message.id
  })
  return true
}

// The Fading test of the system, opened on the technomancer from the GM's card. The value and the strength come from
// the flags of a card written by a GM: a player's card gets no button
async function resistFading(message){
  const data = message.flags?.sr5?.deactivation
  const tm = data?.tmUuid ? await fromUuid(data.tmUuid) : null
  if (!tm) return false
  const {
    SR5_PrepareRollTest
  } = await import("../rolls/roll-prepare.js")
  const chatData = SR5_PrepareRollTest.getBaseRollData(null, tm)
  chatData.test.type = "deactivation"
  chatData.matrix.fading.value = num(data.fading)
  // Compared with the Resonance by the Fading test, as the Level of a decompiled sprite is
  chatData.matrix.fadingLevel = num(data.strength)
  chatData.roll.hits = 0
  // The Fading card keeps the id of this one: the row is marked done only once the test is rolled
  chatData.owner.messageId = message.id
  watchCards()
  tm.rollTest("fading", null, chatData)
  return true
}

// A Fading card rolled from a Deactivation card: the system's Fading test keeps the id of the card it comes from
export function isFadingCardOf(sr5data, cardId){
  return sr5data?.test?.type === "fading" && !!cardId && sr5data?.previousMessage?.messageId === cardId
}

async function markDone(card, attribute){
  const content = contentWithRowDone(card.content, {
    [attribute]: "1"
  }, "[data-sr5-defrag]", game.i18n.localize("SR5.CALENDAR_RowDone"))
  if (content) await card.update({
    content
  }).catch(e => SR5_SystemHelpers.srLog(1, `Deactivation card not marked: ${e}`))
}

// Once the Fading test is rolled, its Deactivation card loses its button; once a request is answered, the request
// loses its own. Only cards written by a GM count: a player's card naming another would take its button away
let watching = false
function watchCards(){
  if (watching) return
  watching = true
  Hooks.on("createChatMessage", async (created) => {
    if (!isActiveGM() || !cardFromGM(created)) return
    const fadingOf = created.flags?.sr5data?.previousMessage?.messageId
    if (isFadingCardOf(created.flags?.sr5data, fadingOf)){
      const card = game.messages.get(fadingOf)
      if (card?.flags?.sr5?.deactivation && cardFromGM(card)) await markDone(card, "defrag-fading")
    }
    const requestId = created.flags?.sr5?.deactivation?.requestId
    const request = requestId ? game.messages.get(requestId) : null
    if (request?.flags?.sr5?.deactivationRequest) await markDone(request, "defrag-request")
  })
}

export function activateDeactivationListeners(html, message){
  const buttons = html.querySelectorAll("[data-sr5-defrag]")
  const isRequest = !!message.flags?.sr5?.deactivationRequest
  // The GM's result card is believed only from a GM; a player's request only offers its button to a GM, who checks
  // when confirming that its author owns the technomancer
  if (!game.user.isGM || (!isRequest && !cardFromGM(message))) return buttons.forEach(b => b.remove())
  buttons.forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_ActiveGMOnly"))
    btn.disabled = true
    watchCards()
    const action = btn.dataset.sr5Defrag
    if (action === "confirm" && isRequest) await confirmRequest(message).catch(e => SR5_SystemHelpers.srLog(1, `Deactivation not confirmed: ${e}`))
    else if (action === "fading" && !isRequest) await resistFading(message).catch(e => SR5_SystemHelpers.srLog(1, `Deactivation fading not opened: ${e}`))
    btn.disabled = false
  }))
}
