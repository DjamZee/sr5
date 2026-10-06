import {
  effectPhase
} from "./drug-phase.js"
import {
  drugHasCrashDamage, drugKeyOf
} from "./drug-damage.js"

// The quality of a drug changes the duration of its crash (Chrome Flesh p. 194): street drugs double it,
// pharmaceutical ones halve it, custom ones divide it by four. Standard is the default
export const DRUG_QUALITY_CRASH_FACTORS = {
  street: 2,
  standard: 1,
  pharmaceutical: 0.5,
  custom: 0.25,
}

// A fraction of a unit goes down to the smaller one (1.5 hours are 90 minutes), so that the sheet shows whole
// numbers and the clock counts the same time; under a Combat Turn, it is rounded, one at least
const SMALLER_UNIT = {
  month: ["day", 30],
  week: ["day", 7],
  day: ["hour", 24],
  hour: ["minute", 60],
  minute: ["combatTurn", 20],
}

export function scaleDuration(value, unit, factor){
  let n = Number(value) * factor
  let type = unit
  while (!Number.isInteger(n) && SMALLER_UNIT[type]){
    const [smaller, ratio] = SMALLER_UNIT[type]
    n *= ratio
    type = smaller
  }
  if (!Number.isInteger(n)) n = Math.max(1, Math.round(n))
  return {
    value: n, unit: type
  }
}

// A drug taken without a stat has no duration nor crash, so the calendar never warns: the GM is told by a
// whisper, and whoever took it by a notification
export async function warnDrugWithoutStat(actor, item){
  const text = game.i18n.format("SR5.WARN_DrugWithoutStat", {
    actor: actor.name, drug: item.name
  })
  ui.notifications.warn(text)
  const gms = ChatMessage.getWhisperRecipients("GM").map(u => u.id)
  if (gms.length) await ChatMessage.create({
    content: `<p>${foundry.utils.escapeHTML?.(text) ?? text}</p>`, whisper: gms
  })
}

// A custom drug made for someone else is a street drug for whoever takes it (Chrome Flesh p. 194: "Si quelqu'un
// utilise une drogue sur mesure prévue pour quelqu'un d'autre, considérez-la comme ayant été préparée dans les
// rues"). Nobody named: custom for anyone, as before the field existed
export function effectiveDrugQuality(system, consumer){
  const quality = system?.quality || "standard"
  if (quality !== "custom" || !system?.preparedFor || !consumer?.id) return quality
  return system.preparedFor === consumer.id ? quality : "street"
}

// The drug stat (handleShot) with the crash duration of its quality, changed in place
export function applyDrugQuality(shot, quality){
  const factor = DRUG_QUALITY_CRASH_FACTORS[quality] ?? 1
  if (!shot || factor === 1) return shot
  const n = Number(shot.durationContrecoup)
  if (Number.isFinite(n) && n > 0 && shot.durationContrecoupType){
    const scaled = scaleDuration(n, shot.durationContrecoupType, factor)
    shot.durationContrecoup = scaled.value
    shot.durationContrecoupType = scaled.unit
  }
  //eX and galak: the -2 social Limit is part of the crash, its (Body) hours follow the quality too
  const social = Number(shot.socialLimitContrecoup)
  if (Number.isFinite(social) && social > 0){
    const scaled = scaleDuration(social, shot.socialLimitContrecoupType ?? "hour", factor)
    shot.socialLimitContrecoup = scaled.value
    shot.socialLimitContrecoupType = scaled.unit
  }
  return shot
}

// Pharmaceutical drugs lower the addiction threshold by 1 (Chrome Flesh p. 194); at 0 the user is free of it
// (SR5 p. 415), so it goes no lower
export function drugAddictionThreshold(system){
  const threshold = Number(system?.addiction?.threshold) || 0
  return system?.quality === "pharmaceutical" ? Math.max(0, threshold - 1) : threshold
}

// The modifier of the interaction roll (Chrome Flesh p. 194, read on the table of p. 197): +1 for each street drug of the mix, -1 when all
// of them are custom
export function drugInteractionModifier(qualities){
  const street = qualities.filter(q => q === "street").length
  const allCustom = qualities.length > 0 && qualities.every(q => q === "custom")
  return street - (allCustom ? 1 : 0)
}

// A crash that is only damage (Cram, "Crash: 6S", SR5 p. 412; Hurlg, Chrome Flesh p. 187): no duration, no effect
// of the crash. The book gives it no length: it is over once its damage is taken (Liesel's D3, such a drug stayed
// in its crash for ever and was rolled in every interaction after it, Chrome Flesh p. 196)
export function drugCrashIsInstant(data){
  const shot = data?.handleShot ?? {
  }
  if (Number(shot.durationContrecoup) > 0) return false
  return !Object.values(data?.customEffects ?? {
  }).some(e => e && typeof e === "object" && effectPhase(e) === "crash")
}

// A drug has a crash when its stat gives it a duration or damage, or when one of its effects applies then
export function drugHasCrash(data){
  const shot = data.handleShot ?? {
  }
  if (Number(shot.durationContrecoup) > 0 || drugHasCrashDamage(drugKeyOf(data), shot)) return true
  return Object.values(data.customEffects ?? {
  }).some(e => e && typeof e === "object" && effectPhase(e) === "crash")
}
