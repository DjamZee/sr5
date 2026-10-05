// Astral phenomena offered as presets of a scene's background count (Aetherologie p. 33-35).
// Choosing one fills the count and its alignment; the GM may change both afterwards, the book
// giving a range. The proposed value is the middle of that range. `noise`: the phenomenon adds its
// Force to the scene's noise rating (the Mist p. 34, the Maya Cloud p. 35). Everything else the book
// says about a phenomenon is only recalled in its tooltip, under SR5.BGPhenomenonHint_<key>.
export const BACKGROUND_COUNT_PHENOMENA = {
  astralRift: {
    value: 0, alignment: "", noise: false, range: "0"
  },
  astralShallows: {
    value: 0, alignment: "", noise: false, range: "0"
  },
  theMist: {
    value: 6, alignment: "", noise: true, range: "3 / 10"
  },
  daoineannDraoidheil: {
    value: 10, alignment: "druid", noise: false, range: "8 / 12"
  },
  fovea: {
    value: -9, alignment: "", noise: false, range: "-7 / -12"
  },
  mayaCloud: {
    value: 15, alignment: "", noise: true, range: "14 / 16"
  },
  theVeil: {
    value: 13, alignment: "", noise: false, range: "12 / 14"
  },
  theVoid: {
    value: -16, alignment: "", noise: false, range: "-13 / -20"
  },
  manaStorm: {
    value: 0, alignment: "", noise: false, range: "—"
  },
}

// Key -> label, for selectOptions
export function phenomenonOptions(){
  return Object.fromEntries(Object.keys(BACKGROUND_COUNT_PHENOMENA).map(k => [k, `SR5.BGPhenomenon_${k}`]))
}

// Noise added by the phenomenon: its Force, i.e. the absolute value of the count
export function phenomenonNoise(phenomenon, backgroundCount){
  if (!BACKGROUND_COUNT_PHENOMENA[phenomenon]?.noise) return 0
  return Math.abs(Number(backgroundCount) || 0)
}
