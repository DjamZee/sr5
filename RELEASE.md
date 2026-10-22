# Publier une version / Release process

[English below](#english)

Ce document décrit comment sort une version de **Shadowrun 5 (unofficial)** sur le dépôt
[DjamZee/sr5-unofficial](https://github.com/DjamZee/sr5-unofficial).

## Numéros de version

| Affiché | Version technique (`system.json`, `package.json`) | Étiquette Git |
|---|---|---|
| 1.0 | `13.1.0` | `v13.1.0` |
| 1.0.1 | `13.1.1` | `v13.1.1` |

Le premier nombre de la version technique suit la version majeure de Foundry visée (13 pour Foundry V13). Une
version corrective (1.0.x) fait monter le dernier nombre ; une version qui ajoute des fonctionnalités (1.x) fait
monter le deuxième. L'étiquette porte un `v` devant.

## Les deux adresses du manifeste

- `manifest` : `https://github.com/DjamZee/sr5-unofficial/releases/latest/download/system.json` — ne change
  jamais ; c'est l'adresse que les MJ collent dans Foundry et que Foundry relit pour proposer les mises à jour.
- `download` : `https://github.com/DjamZee/sr5-unofficial/releases/download/v<version>/sr5.zip` — change à chaque
  version.

`releases/latest` ignore les prereleases : **une version publique ne se publie jamais en prerelease**, sinon le
manifeste de tous les MJ répondrait 404.

## Étapes

1. **Version** : mettre la version technique dans `system.json` (`version`, `download`) et `package.json`, puis
   `npm install --package-lock-only` pour le verrou. Commit seul.
2. **Construire** : `npm run build:megapack` (packs du Mégapack Lite livré avec le système ; il lui faut les sources
   du Mégapack, privées), `npm run build:packs`, puis `npm run check` (doit être vert, Lite « conforme »).
3. **Archive** `sr5.zip`, avec un dossier racine `sr5/` : `system.json`, `LICENSE`, les `.md` de la racine,
   `modules/`, `css/`, `templates/`, `lang/`, `assets/`, `packs/`, `manuel/`, `megapack/` **sans** `megapack/src/` ni
   `megapack/BUILD.json`. On en retire les `__mocks__` et les fichiers de travail des packs (`LOCK`, `LOG`,
   `LOG.old` : un `LOCK` livré rend le pack illisible). Les mainteneurs la construisent par un script qui vérifie la
   version, les deux adresses, la présence de chaque pack et des images citées par le manuel.
4. **Release GitHub** `v<version>`, **pas en prerelease**, avec les assets nommés **exactement** `system.json` et
   `sr5.zip`, plus les PDF du manuel (`Manuel-SR5.pdf`, `Manual-SR5.pdf`). Corps : notes en français puis en
   anglais.
5. **Wiki** : la section ouverte du [Changelog](https://github.com/DjamZee/sr5-unofficial/wiki/Changelog) prend le
   nom de la version.

## Ce que fait GitHub

- `controle.yml` : `npm ci` puis `npm run check` à chaque poussée sur `main` et à chaque pull request. Sans les
  sources privées, le contrôle du Mégapack Lite est sauté.
- `annonce-discord.yml` : à la publication d'une release, l'annonce part sur le Discord (secret `DISCORD_WEBHOOK`).
  Lancement à la main possible, à blanc par défaut.

`npm run release -- <version>` fait l'étape 1 d'un coup (version, `download`, verrou, contrôle, commit) et pose
l'étiquette `v<version>`. Il refuse une version stable hors de la branche `main`.

<a id="english"></a>

## English

How a version of **Shadowrun 5 (unofficial)** is released on
[DjamZee/sr5-unofficial](https://github.com/DjamZee/sr5-unofficial).

### Version numbers

Displayed 1.0 = technical version `13.1.0` (`system.json`, `package.json`) = Git tag `v13.1.0`; 1.0.1 = `13.1.1` =
`v13.1.1`. The first number follows the Foundry major version (13). A fix release bumps the last number, a feature
release the middle one.

### Manifest addresses

- `manifest`: `https://github.com/DjamZee/sr5-unofficial/releases/latest/download/system.json` — never changes.
- `download`: `https://github.com/DjamZee/sr5-unofficial/releases/download/v<version>/sr5.zip` — per version.

`releases/latest` ignores pre-releases: **a public version is never published as a pre-release.**

### Steps

1. Set the version in `system.json` (`version`, `download`) and `package.json`, then
   `npm install --package-lock-only`. Commit.
2. `npm run build:megapack` (Megapack Lite packs shipped with the system; needs the private Megapack sources),
   `npm run build:packs`, `npm run check` (green, Lite "conforme").
3. Build `sr5.zip` with a `sr5/` root folder: `system.json`, `LICENSE`, root `.md` files, `modules/`, `css/`,
   `templates/`, `lang/`, `assets/`, `packs/`, `manuel/`, `megapack/` **without** `megapack/src/` and
   `megapack/BUILD.json`; no `__mocks__`, no pack work files (`LOCK`, `LOG`, `LOG.old`).
4. GitHub release `v<version>`, **not a pre-release**, assets named exactly `system.json` and `sr5.zip`, plus the
   manual PDFs. Body: French notes, then English.
5. Wiki: the open section of the Changelog takes the version name.

### What GitHub runs

- `controle.yml`: `npm ci` + `npm run check` on every push to `main` and every pull request.
- `annonce-discord.yml`: Discord announcement when a release is published (secret `DISCORD_WEBHOOK`).

`npm run release -- <version>` does step 1 at once (version, `download`, lockfile, check, commit) and tags
`v<version>`. It refuses a stable version outside the `main` branch.
