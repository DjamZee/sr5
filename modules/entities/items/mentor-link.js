// The Mentor Spirit quality (SR5 p. 76, 5 Karma) is what a character buys; the itemMentorSpirit it links to
// (system.linkedMentor) carries the bonuses, the drawback and the Mask. Pure rules, no Foundry: items are
// plain {id, type, name, system, flags}.

// A quality named after the mentor spirit quality, in either language, as the compendiums name them:
// "Esprit mentor (Aigle) [Magicien]", "Mentor Spirit (Wolf)", "Esprit Mentor"...
const MENTOR_QUALITY_NAME = /^\s*(esprit\s+mentor|mentor\s+spirit|mentor)\b/i
const VARIANT = /\[\s*(adepte|adept|magicien|magician)\s*\]/i
const MENTOR_NAME = /\(([^)]+)\)/

export const CONVERSION_FLAG = "mentorConversion"

export function isMentorQuality(item){
  return item?.type === "itemQuality" && (MENTOR_QUALITY_NAME.test(item.name || "") || !!item.system?.linkedMentor)
}

function effectsOf(item){
  return Array.isArray(item?.system?.customEffects) ? item.system.customEffects.filter(e => e && typeof e === "object") : []
}

// What the sheet warns about. Nothing is removed: the GM decides.
// - missingQuality: a mentor no Mentor Spirit quality links to (it still applies)
// - missingMentor: a Mentor Spirit quality of the new kind (no effects of its own) that links to no mentor
// - double: an old-style mentor quality still carrying effects next to a mentor item, bonuses counted twice
// An old-style quality alone is still valid: no warning.
export function mentorLinkWarnings(items, magicType){
  const mentors = (items || []).filter(i => i.type === "itemMentorSpirit")
  const qualities = (items || []).filter(isMentorQuality)
  const mentorIds = new Set(mentors.map(m => m.id))
  const linked = new Set(qualities.map(q => q.system?.linkedMentor).filter(id => mentorIds.has(id)))
  const warnings = []
  for (const mentor of mentors){
    if (!linked.has(mentor.id)) warnings.push({
      kind: "missingQuality", mentor: mentor.name
    })
  }
  // A mystic adept draws on no block until the path is picked (SR5 p. 324): say so rather than lose the bonuses
  // in silence (review D1). Only the mentor followed, the first one, counts.
  if (magicType === "mysticalAdept" && mentors.length && !mentors[0].system?.mysticPath) warnings.push({
    kind: "mysticPath", mentor: mentors[0].name
  })
  for (const quality of qualities){
    const hasEffects = effectsOf(quality).length > 0
    if (hasEffects && mentors.length) warnings.push({
      kind: "double", quality: quality.name, mentor: mentors[0].name
    })
    else if (!hasEffects && !mentorIds.has(quality.system?.linkedMentor)) warnings.push({
      kind: "missingMentor", quality: quality.name
    })
  }
  return warnings
}

// The block a variant of the compendium qualities stands for: "[Adepte]" -> adept, "[Magicien]" -> magician
export function variantPath(name){
  const variant = (name || "").match(VARIANT)?.[1]?.toLowerCase()
  if (!variant) return "all"
  return variant.startsWith("adept") ? "adept" : "magician"
}

// The mentor's own name: "Esprit mentor (Aigle) [Magicien]" -> "Aigle"; the quality's name without its
// prefix when it has no brackets
export function mentorNameOf(name){
  const inBrackets = (name || "").match(MENTOR_NAME)?.[1]?.trim()
  if (inBrackets) return inBrackets
  return (name || "").replace(MENTOR_QUALITY_NAME, "").replace(VARIANT, "").replace(/^[\s:–-]+/, "").trim()
}

// The block shared by every quality of a mentor: "adept" or "magician", "" when they differ or have no variant
export function commonPath(qualities){
  const paths = new Set((qualities || []).map(q => variantPath(q.name)))
  if (paths.size !== 1) return ""
  const [path] = paths
  return path === "all" ? "" : path
}

// Plans the conversion of an actor's old-style mentor qualities. The qualities of a same mentor (both
// variants of a mystic adept) become one mentor item; their effects keep the block of their variant, so
// that the character gets exactly what the quality gave. A quality already converted, or already linked,
// is left alone: run again, the plan is empty. A mentor item of the same name is reused, never doubled.
//   create:  [{key, name, description, gameEffect, customEffects}]
//   link:    [{qualityId, mentorKey | mentorId, name, original: {name, customEffects}}]
export function planMentorConversion(items, qualityName){
  const mentors = (items || []).filter(i => i.type === "itemMentorSpirit")
  const groups = new Map()
  for (const quality of (items || []).filter(isMentorQuality)){
    if (quality.flags?.sr5?.[CONVERSION_FLAG] || quality.system?.linkedMentor) continue
    const effects = effectsOf(quality)
    if (!effects.length) continue
    const name = mentorNameOf(quality.name) || quality.name
    const key = name.toLowerCase()
    if (!groups.has(key)) groups.set(key, {
      name, qualities: []
    })
    groups.get(key).qualities.push(quality)
  }

  const create = [], link = []
  for (const [key, group] of groups){
    const existing = mentors.find(m => (m.name || "").trim().toLowerCase() === key)
    if (!existing){
      const first = group.qualities[0]
      create.push({
        key, name: group.name,
        description: first.system?.description ?? "",
        gameEffect: first.system?.gameEffect ?? "",
        // The path of a mystic adept, when every quality of the mentor is of the same variant (review D1)
        mysticPath: commonPath(group.qualities),
        customEffects: group.qualities.flatMap(q => effectsOf(q).map(e => ({
          ...e, mentorPath: variantPath(q.name)
        }))),
      })
    }
    for (const quality of group.qualities){
      link.push({
        qualityId: quality.id,
        ...(existing ? {
          mentorId: existing.id
        } : {
          mentorKey: key
        }),
        name: qualityName,
        original: {
          name: quality.name, customEffects: effectsOf(quality)
        },
      })
    }
  }
  return {
    create, link
  }
}

// Plans going back: each converted quality gets its name and effects again, loses its link; the mentor
// items the conversion created are deleted (those it reused are kept)
export function planMentorRevert(items){
  const restore = [], remove = new Set()
  for (const quality of (items || []).filter(i => i.type === "itemQuality")){
    const saved = quality.flags?.sr5?.[CONVERSION_FLAG]
    if (!saved) continue
    restore.push({
      qualityId: quality.id, name: saved.name, customEffects: saved.customEffects ?? []
    })
    if (saved.createdMentor && quality.system?.linkedMentor) remove.add(quality.system.linkedMentor)
  }
  return {
    restore, remove: [...remove]
  }
}
