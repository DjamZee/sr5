import {
  readFileSync, readdirSync
} from "node:fs"

// The source of SR5_CharacterUtility: utilityActor.js and its family files (utilityActor-*.js, N5 split), end to end,
// for the tests that read the code itself
export function utilityActorSource() {
  const dir = new URL("../../modules/entities/actors/", import.meta.url)
  const families = readdirSync(dir).filter(f => /^utilityActor-[\w-]+\.js$/.test(f)).sort()
  return ["utilityActor.js", ...families].map(f => readFileSync(new URL(f, dir), "utf8")).join("\n")
}
