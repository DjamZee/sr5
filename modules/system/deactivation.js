// Defragmentation echo and the Deactivation resonance action (Dark Terrors p. 89-90): a technomancer with the echo
// forces an AI or a Monad out of its biological host or of its home device.
// - Test: Charisma + Willpower, or, with the Decompiling skill, Decompiling + Resonance + Willpower. The book gives
//   no limit: the Decompiling test is "the usual one", Decompile Sprite is [Social] (SR5 p. 252), so both are [Social].
// - The AI resists with Depth x 2, the Monad with Matrix Entity Concentration (MEC) x 2.
// - Net hits equal to the Depth or the MEC: the digital intelligence is expelled and flees into the Matrix.
// - Fading: 2 per hit of the target (not only the net ones), at least 2.
// Everything is rolled by the active GM's client, on pools it works out itself from the sheets: nothing a player
// writes on a card or a flag counts. The expulsion itself is left to the GM: the card says it, the sheet is untouched.
import {
  SR5_SystemHelpers
} from "./utilitySystem.js"
import {
  markRowDoneInMessage, cardFromGM
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

export function bestMethod(actor){
  return decompilingRating(actor) > 0 ? "decompiling" : "charisma"
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

// Physical when the Depth or the MEC is above the technomancer's Resonance. The book says nothing: by analogy with
// Decompile Sprite, whose Fading is physical when the sprite's Level is above Resonance (SR5 p. 254), to be
// confirmed by DjamZ. The system's Fading test does the comparison itself from matrix.fadingLevel
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

async function rollPool(dicePool, limit){
  if (dicePool <= 0) return {
    hits: 0, dices: []
  }
  //Dynamic import: the roll pipeline loads the whole system, which this module must not need to be tested
  const {
    SR5_RollTest
  } = await import("../rolls/roll-test.js")
  return SR5_RollTest.rollDice({
    dicePool, limit
  })
}

const diceText = (roll) => (roll.dices ?? []).map(d => d.result).join(", ")

// The GM sees the link on the sheet of an AI or a Monad
export function deactivationStatus(actor){
  if (!game.user.isGM) return null
  const kind = targetKind(actor)
  if (!kind) return null
  return {
    kind, strength: targetStrength(actor)
  }
}

// The technomancers of the world who bear the echo: the characters the GM can see
function technomancers(){
  return (game.actors?.contents ?? []).filter(a => ["actorPc", "actorGrunt"].includes(a.type) && hasDefragmentation(a))
}

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
    <div class="form-group"><label>${game.i18n.localize("SR5.DEFRAG_Test")}</label>
      <select name="method">
        <option value="auto">${game.i18n.localize("SR5.DEFRAG_TestBest")}</option>
        <option value="decompiling">${game.i18n.localize("SR5.DEFRAG_TestDecompiling")}</option>
        <option value="charisma">${game.i18n.localize("SR5.DEFRAG_TestCharisma")}</option>
      </select></div>
    <div class="form-group"><label>${game.i18n.localize("SR5.DEFRAG_Modifier")}</label>
      <input type="number" name="modifier" value="0" step="1"></div>
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
  let m = method === "auto" || !method ? bestMethod(tm) : method
  if (m === "decompiling" && decompilingRating(tm) <= 0) m = "charisma"
  const pool = deactivationPool(tm, m, modifier)
  const own = await rollPool(pool.dicePool, pool.limit || undefined)
  const res = await rollPool(strength * 2)
  const out = resolveDeactivation(own.hits, res.hits, strength)
  const resonance = aug(tm, "specialAttributes.resonance")
  const physical = fadingIsPhysical(strength, resonance)
  const strengthLabel = game.i18n.localize(kind === "monad" ? "SR5.DEFRAG_Cem" : "SR5.Depth")
  const testLabel = game.i18n.localize(m === "decompiling" ? "SR5.DEFRAG_TestDecompiling" : "SR5.DEFRAG_TestCharisma")
  const rows = [
    game.i18n.format("SR5.DEFRAG_OwnRoll", {
      tm: escape(tm.name), test: testLabel, pool: pool.dicePool, limit: pool.limit, dice: diceText(own), hits: own.hits ?? 0
    }),
    game.i18n.format("SR5.DEFRAG_TargetRoll", {
      target: escape(target.name), label: strengthLabel, strength, pool: strength * 2, dice: diceText(res), hits: res.hits ?? 0
    }),
    `<strong>${game.i18n.format(out.expelled ? "SR5.DEFRAG_Expelled" : "SR5.DEFRAG_Failed", {
      target: escape(target.name), net: Math.max(0, out.net), needed: strength
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
          tmUuid: tm.uuid, fading: out.fading, strength
        }
      }
    },
  })
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
  tm.rollTest("fading", null, chatData)
  return true
}

export function activateDeactivationListeners(html, message){
  const buttons = html.querySelectorAll("[data-sr5-defrag]")
  if (!game.user.isGM || !cardFromGM(message)) return buttons.forEach(b => b.remove())
  buttons.forEach(button => button.addEventListener("click", async (event) => {
    const btn = event.currentTarget
    if (!isActiveGM()) return ui.notifications.warn(game.i18n.localize("SR5.DEFRAG_ActiveGMOnly"))
    btn.disabled = true
    const done = await resistFading(message).catch(e => SR5_SystemHelpers.srLog(1, `Deactivation fading not opened: ${e}`))
    if (done) await markRowDoneInMessage(btn.closest(".sr5-defrag-row"), "[data-sr5-defrag]", game.i18n.localize("SR5.CALENDAR_RowDone"))
    else btn.disabled = false
  }))
}
