# Bac Simulator — Simulateur du Bac Général (session 2027)

Application web 100 % côté client (HTML5 / CSS3 / JavaScript ES6, **aucun framework,
aucun backend**) permettant à un élève de Première Générale ayant passé les épreuves
anticipées (français écrit, français oral, mathématiques anticipées) de simuler sa
réussite au baccalauréat : points acquis, notes minimales à viser, scénarios, mention.

> ⚠️ Simulation indicative : ne remplace ni les notes officielles ni la délibération du jury.

## Avancement

| Étape | Contenu | Statut |
|---|---|---|
| 0 | Document de conception (`CONCEPTION.md`) | ✅ validé |
| 1 | Arborescence, HTML complet, CSS complet, squelettes JS, icônes PWA | ✅ |
| 2 | `bacData.js` + `calculator.js` (moteur de calcul) + tests | ✅ |
| 3 | `ui.js` + `storage.js` (application interactive, sauvegarde) | ✅ |
| 4 | Tableau de bord Chart.js + assistant | ✅ |
| 5 | Export PDF, PWA activée, accessibilité finale, zoom graphiques | ✅ **← livré : v1.0** |

## Lancer le projet en local

Le projet utilise les **modules ES6** (`<script type="module">`) : la plupart des
navigateurs refusent de les charger en ouvrant directement `index.html` (protocole
`file://`). Il faut servir le dossier via un petit serveur local — une seule commande :

```bash
# Option 1 (Node.js installé)
npx serve .

# Option 2 (Python installé)
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000` (ou l'adresse affichée).
Avec VS Code : extension **Live Server** → clic droit sur `index.html` → *Open with Live Server*.

## Publier gratuitement en ligne

Le site étant purement statique, tous les hébergeurs statiques gratuits conviennent.
HTTPS est fourni automatiquement — indispensable pour la PWA (service worker).

### GitHub Pages (recommandé)
1. Créer un dépôt GitHub et y pousser le contenu du dossier.
2. `Settings` → `Pages` → Source : branche `main`, dossier `/ (root)`.
3. Le site est en ligne sur `https://<pseudo>.github.io/<depot>/`.

### Netlify (le plus rapide)
1. Aller sur https://app.netlify.com/drop
2. Glisser-déposer le dossier du projet. C'est en ligne.

Alternatives équivalentes : Cloudflare Pages, Vercel.

## Structure des fichiers

```
index.html          Interface complète (SPA : 8 écrans en <section>)
style.css           Design system « Encre & Copie », 2 thèmes, mobile-first
script.js           Point d'entrée : navigation, thème, orchestration
bacData.js          ✅ Source unique de vérité réglementaire (coefficients…)
calculator.js       Moteur de calcul pur (testable, sans DOM)
ui.js               Rendu dynamique + graphiques Chart.js
storage.js          Sauvegarde automatique (localStorage, schéma versionné)
pdf.js              Export du bilan PDF (jsPDF)
manifest.json       PWA (installation Android / iOS)
service-worker.js   Cache hors ligne (activé à l'étape 5)
assets/icons/       Icônes PWA (192, 512, maskable, apple-touch)
assets/libs/        Chart.js 4.5.1 + jsPDF 4.2.1 embarqués (hors ligne)
CONCEPTION.md       Document de conception validé (règles officielles, algorithmes)
```

## PWA & hors ligne (étape 5)

Le service worker est **actif** : à la première visite, tous les fichiers
(bibliothèques comprises) sont mis en cache — l'application fonctionne
ensuite entièrement hors ligne. Installation :

- **Android / ordinateur** : bouton « Installer sur cet appareil » (écran
  Réglages) ou menu du navigateur → « Installer l'application ».
- **iPhone / iPad** : Safari → Partager → « Sur l'écran d'accueil ».

⚠️ Après chaque mise à jour du site, **incrémenter `NOM_CACHE`** dans
`service-worker.js` (`bac-simulator-v1` → `-v2`…) pour que les visiteurs
reçoivent la nouvelle version au rechargement suivant.

## Export PDF (étape 5)

Le bouton « Télécharger le bilan PDF » (écran Réglages) génère un document
A4 complet : identité, synthèse, grille notes/coefficients, scénarios et
les 4 graphiques (re-rendus hors écran en thème clair pour l'impression).
Aucune donnée ne quitte l'appareil : le PDF est fabriqué localement par
jsPDF.

## Agrandir un graphique

Sur le tableau de bord, chaque graphique se touche (ou s'active au clavier :
Tab puis Entrée) pour s'ouvrir en plein écran — pratique sur téléphone.
Fermeture : bouton ✕, touche Échap, ou clic hors du cadre.

## Tableau de bord (étape 4)

Quatre graphiques Chart.js (bibliothèque **embarquée** dans `assets/libs/`,
aucun CDN → fonctionne hors ligne) :
répartition des coefficients (donut), points acquis / projetés / restants
(barre empilée), jauge de progression vers l'objectif (avec pourcentage),
et note moyenne requise en Terminale pour chaque mention (barres colorées :
vert = déjà à ton niveau, rouge = inaccessible). Les graphiques se
reconstruisent à l'ouverture de l'écran, à chaque recalcul et au changement
de thème.

## Sauvegarde locale (étape 3)

L'état complet de la simulation (profil, spécialités, options, notes, thème,
écran courant) est enregistré automatiquement dans le `localStorage` du
navigateur sous la clé `bac-simulator.v1`, à chaque modification. Rien n'est
envoyé sur Internet. Le bouton « Reprendre » de l'accueil rouvre la simulation
là où elle a été laissée ; « Réinitialiser » (écran Réglages) efface tout
après confirmation. Le schéma est versionné (`schemaVersion`) pour permettre
des migrations futures sans perte de données.

## Tests du moteur de calcul

Le moteur (`calculator.js`) est couvert par **30 tests** (`tests.js`).
Deux façons de les lancer :

- **Navigateur** : ouvrir `tests.html` (via le serveur local) → rapport visuel.
- **Node** : `node --input-type=module -e "import('./tests.js').then(m => process.exit(m.afficherConsole()))"`

⚠️ À relancer après **toute** modification de `bacData.js` : les tests vérifient
les totaux de coefficients (100 hors options), les seuils de mentions, la
mécanique des options et des scénarios.

## Modifier les coefficients (évolution réglementaire)

Toutes les données réglementaires vivent dans **`bacData.js`** et uniquement là :
coefficients des épreuves et du contrôle continu, liste des spécialités et options,
seuils de mentions, règles d'arrondi. Modifier une valeur dans ce fichier suffit —
aucun autre fichier à toucher. La structure détaillée est documentée dans
`CONCEPTION.md` (§ 3.1) et sera commentée champ par champ à l'étape 2.

## Code de la « marge de copie » (design)

Chaque ligne de note porte une marge colorée à gauche qui code son statut :
- **marge pleine bleue** : note acquise (épreuve passée, bulletin de Première) ;
- **marge pointillée** : hypothèse de Terminale (modifiable au fil de l'année) ;
- **marge tiretée grise** : épreuve à venir, non renseignée.

## PWA (étape 5)

`manifest.json` et `service-worker.js` sont prêts ; l'enregistrement du service
worker est volontairement commenté dans `script.js` pendant le développement
(pour éviter de mettre en cache une version incomplète). L'étape 5 l'activera et
documentera l'installation sur Android (bannière) et iOS (Partager → Sur l'écran
d'accueil).
