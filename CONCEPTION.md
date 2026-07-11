# Document de conception — Simulateur Bac Général (session 2027)

> **Statut** : proposition à valider avant tout développement.
> **Public cible** : élèves de Première Générale ayant passé les épreuves anticipées (français écrit/oral + mathématiques anticipées), c'est-à-dire les candidats de la **session 2027** du baccalauréat.
> **Version** : 0.1 — 11 juillet 2026

---

## 1. Cadre réglementaire retenu

### 1.1 Textes de référence

| Texte | Objet |
|---|---|
| Arrêté du 16 juillet 2018 modifié (épreuves du bac général) | Structure des épreuves, coefficients |
| Décret n° 2025-513 et arrêté du 10 juin 2025 | Création de l'épreuve anticipée de mathématiques, applicable **session 2027** ; Grand oral ramené à coefficient 8 en voie générale |
| Arrêté du 27 juillet 2021 / 21 avril 2022 | Contrôle continu intégral, options à coefficient 2 par année |
| Note de service Éduscol sur le contrôle continu | Arrondi des moyennes annuelles **au dixième de point supérieur** |

### 1.2 Répartition des coefficients (voie générale, session 2027, hors options)

**Total : 100** = 40 (contrôle continu) + 60 (épreuves terminales).

**Épreuves terminales (60)**

| Épreuve | Moment | Coef |
|---|---|---|
| Français écrit | Fin de Première | 5 |
| Français oral | Fin de Première | 5 |
| Mathématiques anticipées | Fin de Première | **2** (nouveau) |
| Spécialité 1 | Terminale | 16 |
| Spécialité 2 | Terminale | 16 |
| Philosophie | Terminale | 8 |
| Grand oral | Terminale | **8** (10 → 8 dès 2027) |

**Contrôle continu (40)** — moyennes annuelles de bulletin

| Matière | Coef 1re | Coef Term | Total |
|---|---|---|---|
| Histoire-géographie | 3 | 3 | 6 |
| LVA | 3 | 3 | 6 |
| LVB | 3 | 3 | 6 |
| Enseignement scientifique* | 3 | 3 | 6 |
| EPS | — | 6 | 6 |
| EMC | 1 | 1 | 2 |
| Spécialité abandonnée en fin de 1re | 8 | — | 8 |

\* L'enseignement scientifique intègre l'enseignement de mathématiques spécifique pour les élèves sans spécialité maths. Il reste **une seule ligne de note** au bulletin : le simulateur ne le scinde pas.

**Point de vigilance (à confirmer avec toi)** : la répartition de l'EPS (6 en Terminale via CCF, ou 3+3) varie selon les sources. Je retiens l'EPS **entièrement en Terminale (coef 6, CCF)**, conformément à la grille officielle. Paramétrable dans `bacData.js` de toute façon.

### 1.3 Options (enseignements optionnels)

- Chaque option = **coefficient 2 par année suivie**, **ajouté au total des coefficients** (ex. : latin en 1re + Term → coef 4 → total 104). Ce n'est **pas** un bonus « points au-dessus de 10 » : une mauvaise note d'option peut faire baisser la moyenne.
- Contraintes de choix (voie générale) :
  - **1 option max en Première**, **2 options max en Terminale** ;
  - **LCA latin et/ou grec** peuvent être suivis **en sus** de ces plafonds ;
  - Options réservées à la Terminale : **Maths expertes** (nécessite spé maths conservée), **Maths complémentaires** (nécessite spé maths abandonnée), **DGEMC**.
- Liste proposée : LVC, Arts plastiques, Musique, Théâtre, Cinéma-audiovisuel, Danse, Histoire des arts, EPS, Latin, Grec, Maths expertes, Maths complémentaires, DGEMC.
- Le simulateur validera les règles de compatibilité (ex. impossible de prendre Maths complémentaires si la spé maths est conservée).

### 1.4 Spécialités (13)

Maths, Physique-chimie, SVT, SES, HGGSP, HLP, LLCER (anglais / anglais monde contemporain / espagnol / allemand / italien…), LCA, NSI, SI, Arts, Biologie-écologie (agricole), EPPCS.

Cas particulier **Sciences de l'ingénieur** en Terminale : l'épreuve intègre un enseignement de physique ; aucun impact sur les coefficients → pas de traitement spécial.

### 1.5 Admission, mentions, rattrapage

| Moyenne finale | Résultat |
|---|---|
| ≥ 16 | Mention Très Bien (≥ 18 : félicitations du jury) |
| ≥ 14 | Mention Bien |
| ≥ 12 | Mention Assez Bien |
| ≥ 10 | Admis |
| ≥ 8 et < 10 | Épreuves de rattrapage (2d groupe) |
| < 8 | Ajourné |

### 1.6 Règles d'arrondi

- Moyennes annuelles de contrôle continu : **arrondi au dixième de point supérieur** (appliqué matière par matière, par année).
- Notes d'épreuves : saisies telles quelles (0–20, pas de 0,25 accepté à la saisie ? → je propose un pas de 0,25 pour coller aux notes réelles, plafonné à 2 décimales).
- Moyenne finale affichée au **centième**, mention déterminée sur la valeur exacte (le jury peut arrondir, mais le simulateur reste factuel et le précise).

---

## 2. Architecture technique

### 2.1 Arborescence

```
/
├── index.html            SPA : tous les « écrans » sont des <section> montrées/cachées
├── style.css             Design system complet (variables CSS, mode sombre)
├── script.js             Point d'entrée : init, routage d'écrans, orchestration
├── bacData.js            ✅ SOURCE UNIQUE DE VÉRITÉ réglementaire (coefficients, matières, mentions)
├── calculator.js         Moteur de calcul pur (aucune manipulation du DOM)
├── ui.js                 Rendu DOM, composants, écrans, graphiques Chart.js
├── storage.js            localStorage : save/load/reset, versionnage du schéma
├── pdf.js                Export PDF (jsPDF + captures des canvas Chart.js)
├── manifest.json         PWA
├── service-worker.js     Cache offline (stratégie cache-first sur les assets)
├── assets/
│   ├── icons/            icônes PWA 192/512 + maskable + apple-touch-icon
│   └── libs/             chart.umd.min.js, jspdf.umd.min.js (embarquées → offline garanti)
└── README.md
```

**Modules ES6** (`<script type="module">`). Fonctionne sur hébergement statique. ⚠️ *Contrainte connue* : les modules ES6 ne se chargent pas en ouvrant `index.html` en `file://` sur certains navigateurs. Deux parades documentées dans le README : `npx serve` / extension Live Server, ou build de secours en scripts classiques ordonnés. **À trancher ensemble** (je recommande les modules + petit serveur local).

### 2.2 Dépendances

- **Chart.js** (graphiques) — embarqué localement dans `assets/libs/` pour le mode hors ligne.
- **jsPDF** (export PDF) — idem. Les graphiques sont insérés dans le PDF via `canvas.toDataURL()`.
- Zéro framework, zéro CSS externe.

### 2.3 Flux de données (unidirectionnel)

```
Saisie utilisateur → ui.js (événements) → mutation de l'état (state)
        → calculator.compute(state, bacData) → résultats
        → ui.render(résultats) + storage.save(state)
```

- `calculator.js` est **100 % pur** (entrées → sorties, pas de DOM, pas de localStorage) → testable et maintenable.
- Chaque frappe déclenche un recalcul complet (< 1 ms sur ~30 matières) → mises à jour instantanées, aucun rechargement.

---

## 3. Modèle de données

### 3.1 `bacData.js` (extrait de structure)

```js
export const BAC_DATA = {
  session: 2027,
  epreuvesTerminales: [
    { id: "fr-ecrit",  label: "Français écrit",          coef: 5,  annee: "premiere", type: "anticipee" },
    { id: "fr-oral",   label: "Français oral",           coef: 5,  annee: "premiere", type: "anticipee" },
    { id: "maths-ant", label: "Mathématiques anticipées",coef: 2,  annee: "premiere", type: "anticipee" },
    { id: "spe1",      label: null /* dynamique */,      coef: 16, annee: "terminale" },
    { id: "spe2",      label: null,                      coef: 16, annee: "terminale" },
    { id: "philo",     label: "Philosophie",             coef: 8,  annee: "terminale" },
    { id: "grand-oral",label: "Grand oral",              coef: 8,  annee: "terminale" },
  ],
  controleContinu: [
    { id: "hg",  label: "Histoire-géographie",     coefPremiere: 3, coefTerminale: 3 },
    { id: "lva", label: "LVA",                     coefPremiere: 3, coefTerminale: 3 },
    { id: "lvb", label: "LVB",                     coefPremiere: 3, coefTerminale: 3 },
    { id: "es",  label: "Enseignement scientifique", coefPremiere: 3, coefTerminale: 3 },
    { id: "eps", label: "EPS",                     coefPremiere: 0, coefTerminale: 6 },
    { id: "emc", label: "EMC",                     coefPremiere: 1, coefTerminale: 1 },
    { id: "spe-abandonnee", label: null,           coefPremiere: 8, coefTerminale: 0 },
  ],
  specialites: [ { id: "maths", label: "Mathématiques" }, /* … 13 entrées … */ ],
  options: [
    { id: "maths-exp",  label: "Maths expertes",        annees: ["terminale"], condition: "speMathsConservee" },
    { id: "maths-comp", label: "Maths complémentaires", annees: ["terminale"], condition: "speMathsAbandonnee" },
    { id: "latin", label: "Latin", annees: ["premiere","terminale"], lca: true },
    /* … */
  ],
  optionCoefParAnnee: 2,
  mentions: [
    { seuil: 16, label: "Très Bien" }, { seuil: 14, label: "Bien" },
    { seuil: 12, label: "Assez Bien" }, { seuil: 10, label: "Admis" },
    { seuil: 8,  label: "Rattrapage" },
  ],
  regles: { arrondiCC: "dixiemeSuperieur", plafondCoefOptions: 14 },
};
```

Toute évolution réglementaire = modification de ce seul fichier (documenté dans le README).

### 3.2 État de l'application (`state`, persisté en localStorage)

```js
{
  schemaVersion: 1,                     // migrations futures
  profil: { prenom, nom, academie, objectif },   // objectif: 10|12|14|16|18|20
  specialites: { choisies: [id,id,id], abandonnee: id },
  options: { premiere: [ids], terminale: [ids] },
  saisieCC: "moyenne" | "trimestres",
  notes: {
    epreuves:  { "fr-ecrit": 13.5, "fr-oral": null, "maths-ant": 12, philo: null, … },
    ccPremiere:{ "hg": { moyenne: 14.2 } | { t1: 13, t2: 14, t3: 15 }, … },
    ccTerminale:{ … }   // hypothèses de l'élève, pré-remplies avec la 1re
  },
  ui: { theme: "auto"|"clair"|"sombre", ecranCourant },
  meta: { creeLe, modifieLe }
}
```

**Clé de conception** : les notes de Terminale (CC + épreuves) sont des **hypothèses modifiables**. Par défaut, le CC de Terminale est **projeté = moyennes de Première** (l'élève peut ajuster). Cette hypothèse est affichée explicitement pour ne jamais présenter une projection comme un acquis.

---

## 4. Algorithmes de calcul (`calculator.js`)

### 4.1 Construction dynamique de la grille

`buildGrille(state, BAC_DATA)` → liste de « lignes de notation » avec pour chacune : `{ id, label, coef, statut }` où `statut ∈ { acquis, projeté, à venir }`.
- Injecte les 2 spés conservées (coef 16) et la spé abandonnée (coef 8 CC 1re).
- Ajoute les options (coef 2/année suivie), en incrémentant le **coefficient total** (100 → 100 + Σ options).
- N'affiche **jamais** une matière hors du parcours de l'élève (exigence du cahier des charges).

### 4.2 Grandeurs affichées en permanence

Avec `T` = coef total, pour chaque ligne `i` : note `nᵢ`, coef `cᵢ` :

- **Points acquis** = Σ (nᵢ × cᵢ) sur les lignes `acquis` (EA + CC de Première validé).
- **Points projetés** = idem sur les lignes `projeté` (CC Terminale par défaut).
- **Points restants max** = Σ (20 × cᵢ) sur les lignes non acquises.
- **Moyenne actuelle** = points acquis / coefs acquis (moyenne « au mérite actuel »).
- **Moyenne projetée** = (acquis + projetés + hypothèses d'épreuves) / T.
- **Mention actuelle** (si tout s'arrêtait là) et **meilleure mention encore atteignable** = (acquis + 20 × coefs restants) / T → comparée aux seuils.

### 4.3 Notes minimales pour un objectif `M` (10/12/14/16/18/20)

Points à obtenir sur les épreuves restantes :

```
P = M × T − pointsAcquis − pointsProjetésCC
R = Σ coefs des épreuves restantes (philo 8 + GO 8 + spé 16 + spé 16 = 48)
noteUniforme = P / R          // note identique nécessaire partout
```

- Si `noteUniforme > 20` → objectif **mathématiquement inaccessible** (message clair + meilleure moyenne atteignable).
- Si `noteUniforme ≤ 0` → objectif **déjà garanti** par les acquis + projection.

### 4.4 Scénarios

Chaque scénario est un vecteur de pondérations `wᵢ` (delta autour de la note uniforme), résolu sous contraintes `0 ≤ nᵢ ≤ 20` avec redistribution itérative de l'excédent si une note sature à 20 (ou plancher réaliste à 5) :

| Scénario | Principe |
|---|---|
| Équilibré | même note partout (= noteUniforme) |
| Spécialités d'abord | spés +2 pts, philo/GO compensent à la baisse |
| Grand oral d'abord | GO +3 pts (épreuve « rentable » à la préparation), reste compensé |
| Optimiste | notes = max(moyennes de 1re dans les matières proches, noteUniforme) sur spés, reste ajusté |

Chaque scénario affiche les 4 notes cibles + un badge « réaliste / ambitieux / très exigeant » selon l'écart aux moyennes actuelles.

### 4.5 « Probabilité de réussite » (estimation transparente)

Pas de vraie probabilité (aucune donnée statistique). Je propose un **indice de faisabilité** assumé comme heuristique, basé sur l'écart `Δ = noteUniforme − moyenneActuelleÉlève` :

```
Δ ≤ −2 : ~95 %   |   −2 < Δ ≤ 0 : ~80 %   |   0 < Δ ≤ 1 : ~60 %
1 < Δ ≤ 2 : ~40 %   |   2 < Δ ≤ 3 : ~20 %   |   Δ > 3 : < 10 %
noteUniforme > 20 : 0 %   |   objectif déjà garanti : 100 %
```

Affiché avec la mention « estimation indicative fondée uniquement sur tes notes ». Barème centralisé dans `bacData.js`. **À valider** : garder le mot « probabilité » ou préférer « indice de faisabilité » (ma recommandation).

### 4.6 Assistant intelligent (règles déterministes)

Moteur de conseils = liste de règles `(condition sur les résultats) → message templaté`, dans `calculator.js` :
- mention X « facilement atteignable » si noteUniforme(X) ≤ moyenneActuelle − 1 ;
- « nécessitera une excellente performance » si noteUniforme(X) ∈ [16, 20] ;
- part des spés : `32/T` → « Tes spécialités représentent N % de ta note finale » ;
- levier Grand oral : `(20 − hypothèseGO) × 8 / T` points gagnables ;
- alerte rattrapage si moyenne projetée < 10 ; alerte option pénalisante si note d'option < moyenne générale ; etc.

### 4.7 Cas particuliers gérés

1. **Notes manquantes** : tout champ vide = exclu du calcul « acquis », inclus dans « restant » — jamais compté 0.
2. **Trimestres incomplets** : moyenne sur les trimestres saisis (2/3 possibles), signalé visuellement.
3. **Options** : ajout/retrait recalcule T partout ; plafond de coef d'options (14) contrôlé ; conditions maths expertes/complémentaires.
4. **Spé abandonnée** : bascule automatique épreuve coef 16 → CC coef 8 (1re uniquement).
5. **Objectif « 20/20 »** : traité comme objectif M = 20 (quasi toujours « inaccessible » → message pédagogique dédié).
6. **Rattrapage** : zone 8–10 signalée avec explication du 2d groupe (pas de simulation des oraux de rattrapage en v1 — **à confirmer**).
7. Saisie bornée 0–20, virgule française acceptée (`13,5`), `inputmode="decimal"`.

---

## 5. Parcours utilisateur & écrans

Navigation par étapes type « wizard », avec barre de progression et retour libre :

1. **Accueil** — carte titre/description, `Commencer`, `Reprendre` (visible seulement si sauvegarde existante, avec date), lien « Comment ça marche ? ».
2. **Profil** — prénom/nom/académie (facultatifs), choix de l'objectif (chips : Admis / AB / B / TB / 20).
3. **Spécialités** — sélection de 3 parmi 13, puis désignation de l'abandonnée (les épreuves et le CC s'adaptent instantanément).
4. **Options** — par année, avec règles de compatibilité appliquées en direct.
5. **Notes** — onglets *Épreuves anticipées* / *Contrôle continu 1re* / *Hypothèses Terminale* ; bascule « moyenne annuelle ↔ 3 trimestres » par matière ou globale.
6. **Résultats** — bandeau récapitulatif permanent (moyenne, points acquis/restants, mention) + scénarios + conseils.
7. **Tableau de bord** — 5 graphiques Chart.js : donut répartition des coefficients ; barres empilées acquis/projetés/restants ; jauge de progression vers l'objectif ; barres « note uniforme requise par mention » ; radar ou barres par matière.
8. **Export / réglages** — bouton PDF, thème, réinitialisation (avec confirmation).

Le **bandeau de synthèse** (moyenne, points, mention) reste visible sur les écrans 5–7 (sticky), mis à jour à chaque frappe.

---

## 6. Design, accessibilité, PWA, PDF

- **Design** : mobile-first, cartes arrondies (radius 16), ombres douces, variables CSS (`--surface`, `--accent`…), mode sombre via `prefers-color-scheme` + bascule manuelle persistée, transitions ≤ 200 ms respectant `prefers-reduced-motion`. Grid pour les tableaux de bord, Flexbox pour les formulaires.
- **Accessibilité** : navigation clavier complète (wizard en vrais `<button>`/`<a>`), `aria-live="polite"` sur le bandeau de résultats, labels explicites, erreurs reliées par `aria-describedby`, contrastes AA vérifiés dans les deux thèmes, focus visibles.
- **PWA** : `manifest.json` (icônes 192/512 + maskable, `display: standalone`, thème), service worker **cache-first** avec version de cache (`bac-sim-v1`) précachant tous les assets → 100 % hors ligne après première visite. Bannière d'installation Android (`beforeinstallprompt`) + instructions iOS (« Partager → Sur l'écran d'accueil »).
- **PDF** (`pdf.js` du projet, basé sur jsPDF) : en-tête (nom, académie, date, session 2027), tableau des notes/coefficients, synthèse des calculs, scénarios, graphiques capturés depuis les canvas, pied de page « Simulation indicative — ne constitue pas un résultat officiel ».

---

## 7. Plan de développement (validation à chaque jalon)

| Étape | Livrable | Validation |
|---|---|---|
| **0** | Ce document | ✋ **← nous sommes ici** |
| 1 | Arborescence + fichiers initiaux + HTML complet + CSS complet (interface statique navigable, 2 thèmes) | ✋ |
| 2 | `bacData.js` + `calculator.js` + mini-page de tests des calculs | ✋ |
| 3 | `ui.js` + `storage.js` : application interactive complète | ✋ |
| 4 | Tableau de bord Chart.js + assistant | ✋ |
| 5 | PDF, PWA, accessibilité finale, README | ✋ |

---

## 8. Questions à trancher avant l'étape 1

1. **Modules ES6 + serveur local** (recommandé) ou compatibilité stricte `file://` ?
2. Chart.js / jsPDF **embarqués localement** (recommandé pour l'offline) — OK ?
3. « **Probabilité de réussite** » : garder ce mot ou « indice de faisabilité » ?
4. Simulation du **rattrapage** (oraux du 2d groupe) : hors périmètre v1 ?
5. CC Terminale **pré-rempli avec les moyennes de Première** comme hypothèse par défaut : OK ?
6. EPS : je retiens coef 6 entièrement en Terminale (CCF) — confirmes-tu ?
7. Liste des académies : liste déroulante officielle (30 académies) ou champ libre ?
