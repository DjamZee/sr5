import {
  describe, expect, it 
} from 'vitest'
import {
  LIMITE_DESCRIPTION,
  LIMITE_EMBED,
  MAGENTA,
  construireMessage,
  couper,
  versDiscord,
} from '../.github/actions/annonce-discord/annonce.mjs'

const repo = 'DjamZee/sr5'
const base = 'https://github.com/DjamZee/sr5/releases/download/13.0.0-djamz.13'
const release = (corps, prerelease = true) => ({
  name: '13.0.0-djamz.13',
  tag_name: '13.0.0-djamz.13',
  html_url: 'https://github.com/DjamZee/sr5/releases/tag/13.0.0-djamz.13',
  prerelease,
  body: corps,
  assets: [
    {
      name: 'system.json', browser_download_url: `${base}/system.json` 
    },
    {
      name: 'sr5_13.0.0-djamz.13.zip', browser_download_url: `${base}/sr5_13.0.0-djamz.13.zip` 
    },
    {
      name: 'Rapport.pdf', browser_download_url: `${base}/Rapport.pdf` 
    },
  ],
})

function taille(embed) {
  return embed.title.length + embed.description.length + embed.footer.text.length +
        embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0)
}

describe('annonce Discord', () => {
  it('met les titres et les tableaux à plat', () => {
    const texte = versDiscord('## Modules\n\n| Module | Version |\n|---|---|\n| **Mégapack** | 2.0.18 |')
    expect(texte).toBe('**Modules**\n\n• **Mégapack** · 2.0.18')
  })

  it('recolle les paragraphes coupés à la main, citations et listes comprises', () => {
    const texte = versDiscord('Un paragraphe\ncoupé en deux.\n\n> Une citation\n> sur deux lignes.\n>\n> Suite.\n\n- un point\n  qui continue\n- un autre')
    expect(texte).toBe('Un paragraphe coupé en deux.\n\n> Une citation sur deux lignes.\n>\n> Suite.\n\n- un point qui continue\n- un autre')
  })

  it('coupe à une fin de ligne et renvoie vers GitHub', () => {
    const texte = Array.from({
      length: 50 
    }, (_, i) => `ligne ${i}`).join('\n')
    const coupe = couper(texte, 100, 'https://x')
    expect(coupe.length).toBeLessThanOrEqual(100)
    expect(coupe).toMatch(/ligne \d+\n\n… \[suite sur GitHub\]\(https:\/\/x\)$/)
  })

  it('ferme un bloc de code laissé ouvert par la coupe', () => {
    const coupe = couper('```\n' + 'a\n'.repeat(200) + '```', 80, 'https://x')
    expect((coupe.match(/```/g) ?? []).length % 2).toBe(0)
  })

  it("compose l'embed d'une alpha sous les limites de Discord", () => {
    const message = construireMessage(release('x\n'.repeat(5000)), {
      repo, username: 'Shadow Talker DjamZ' 
    }, () => 0)
    const [embed] = message.embeds
    expect(embed.color).toBe(MAGENTA)
    expect(embed.description.length).toBeLessThanOrEqual(LIMITE_DESCRIPTION)
    expect(taille(embed)).toBeLessThanOrEqual(LIMITE_EMBED)
    expect(embed.description).toContain('— Shadow Talker DjamZ')
    expect(embed.description).toContain('suite sur GitHub')
    expect(embed.fields.map(f => f.name)).toEqual(['📡 Manifeste', '💾 Téléchargement', '📖 Wiki', '📄 Rapport PDF', '⚠️ Alpha'])
    expect(embed.fields[0].value).toContain(`${base}/system.json`)
    expect(message.allowed_mentions).toEqual({
      parse: [] 
    })
  })

  it("n'ajoute pas la mention d'alpha à une version stable", () => {
    const [embed] = construireMessage(release('Notes courtes.', false), {
      repo 
    }).embeds
    expect(embed.fields.some(f => f.name.includes('Alpha'))).toBe(false)
    expect(embed.description).not.toContain('suite sur GitHub')
  })
})
