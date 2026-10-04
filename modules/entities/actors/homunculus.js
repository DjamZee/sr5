import {
  SR5_BARRIER_RATINGS
} from "../../config.js"

/**
 * Structure and Armor of the material a homunculus is made of (SR5 p. 301, table SR5 p. 198).
 * "other" reads the values typed in on the sheet; no material gives 0, the Body of a homunculus before.
 */
export function homunculusMaterialRatings(material) {
  if (material?.type === "other") return {
    structure: Math.max(0, Number(material.structure) || 0),
    armor: Math.max(0, Number(material.armor) || 0),
  }
  const ratings = SR5_BARRIER_RATINGS[material?.type]
  return ratings ? {
    ...ratings
  } : {
    structure: 0, armor: 0
  }
}
