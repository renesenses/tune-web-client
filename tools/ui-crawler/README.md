# tune-ui-crawler

Automate d'exploration autonome de l'interface Tune. Il ouvre l'application,
parcourt toutes les vues, actionne tout ce qui est actionnable, observe ce qui
se passe, et **ouvre une issue documentee par defaut trouve** — avec les etapes
de reproduction, la requete HTTP correlee, la pile d'appel, une capture d'ecran
et la piste correspondante dans le code source.

Il ne contient aucun scenario ecrit a la main : il ne sait pas qu'il existe une
notation d'album, une file d'attente ou un egaliseur. Il decouvre le menu,
recense les controles, agit, et compare l'avant et l'apres.

## Utilisation

```bash
npm install                     # playwright (chromium en cache si deja present)

node run.mjs --serve            # demarre un serveur jetable et explore tout
node run.mjs --serve --headed   # en regardant faire
node run.mjs --base-url http://127.0.0.1:8888   # instance deja lancee
```

Le rapport arrive dans `issues/` :

```
issues/
├── index.md                    # tableau de synthese, trie par severite
├── report.json                 # meme contenu, pour l'outillage
├── ISSUE-001-….md              # une issue par defaut distinct
└── captures/                   # une capture par issue
```

### Options

| Option | Defaut | Role |
|---|---|---|
| `--serve` | — | demarre un serveur Tune jetable (port libre, copie de la base) |
| `--base-url <url>` | `http://127.0.0.1:8291` | instance a explorer |
| `--db <chemin>` | base de l'utilisateur | base a copier pour le bac a sable |
| `--max-actions <n>` | 400 | budget total d'interactions |
| `--max-per-state <n>` | 24 | controles actionnes par ecran |
| `--allow-devices` | — | autorise l'appairage du materiel reel du reseau (voir plus bas) |
| `--max-depth <n>` | 3 | profondeur de descente (vue → fiche → modale) |
| `--headed` | — | affiche le navigateur |
| `--out <dossier>` | `issues` | destination du rapport |
| `--repo-client <depot>` | — | depot ou ouvrir les issues d'interface |
| `--repo-server <depot>` | — | depot ou ouvrir les issues de reponse serveur |
| `--publish-dry-run` | — | afficher les issues qui seraient ouvertes, sans rien creer |
| `--min-severity <n>` | `medium` | plancher de publication (`critical`…`low`) |
| `--redact <a,b>` | — | termes supplementaires a masquer avant publication |

Code de sortie : `1` si au moins un defaut est trouve, `0` sinon — utilisable
tel quel dans une CI. Une interruption (Ctrl-C, `SIGTERM`, plafond de temps
d'une CI) ecrit quand meme le rapport de ce qui a ete trouve jusque-la, marque
comme partiel.

## Bac a sable

L'automate travaille toujours a cote de l'installation reelle :

- `--serve` copie `~/Library/Application Support/Tune/tune.db` dans un dossier
  temporaire et lance le serveur dessus. La bibliotheque de l'utilisateur n'est
  jamais modifiee.
- Toutes les zones sont mises a volume 0 avant de commencer **et toutes les 15
  secondes ensuite** : l'automate clique des boutons de lecture, et la
  decouverte reseau ajoute des zones en cours de passage (une enceinte qui
  s'annonce, un televiseur qui se reveille) — celles-la arrivent avec leur
  volume par defaut. Couper le son une seule fois au demarrage ne suffit pas ;
  on l'a appris en mettant de la musique chez quelqu'un qui travaillait.
- Les actions dont l'effet sort du bac a sable ne sont jamais declenchees :
  arret/redemarrage du serveur, scan de dossiers, connexion a un service de
  streaming, installation de greffon, import/export de fichiers, deconnexion,
  achat. La liste est dans `src/config.mjs` (`HARD_SKIP`) et le rapport indique
  ce qui a ete ecarte.
- Les liens externes sont ignores : ils emmeneraient l'automate hors du site.
- **Le materiel reel du reseau n'est jamais appaire** : cliquer « AirPlay » sur
  le televiseur du salon le fait reellement changer d'entree. Les enceintes,
  televiseurs, Chromecast et renderers UPNP decouverts sont ecartes, sauf
  `--allow-devices` sur un reseau de test.

Pour tenir le budget, un meme type de controle n'est actionne qu'un nombre
limite de fois sur l'ensemble du passage (`maxPerShape`, 8 par defaut) : la
barre de lecture est presente dans les quinze vues, la tester quinze fois ne
revele rien de plus. Le rapport liste ce qui a ete ecarte et pourquoi.

## Ce qu'il detecte

| Categorie | Severite | Description |
|---|---|---|
| `js-exception`, `unhandled-rejection` | critique | exception ou promesse rejetee non geree |
| `http-5xx`, `network-failure` | critique | erreur serveur ou requete qui n'aboutit pas |
| `http-4xx` | majeure | endpoint absent ou requete invalide emise par l'UI |
| `false-error-empty-body` | majeure | **l'UI affiche une erreur alors que l'operation a reussi** — reponse 204/corps vide parsee en JSON |
| `false-error-toast` | majeure | message d'erreur sans aucune requete en echec |
| `error-toast` | majeure | erreur affichee, avec la requete fautive |
| `modal-not-dismissable` | majeure | modale que ni Echap ni le bouton de fermeture ne ferment |
| `empty-view`, `stuck-loading` | majeure | vue sans contenu, ou bloquee sur son indicateur de chargement |
| `console-error` | moyenne | `console.error` non filtre |
| `unclickable-control` | moyenne | element visible mais impossible a cliquer (recouvert) |
| `i18n-key-visible` | moyenne | cle de traduction affichee brute (`library.ratingError`) |
| `inert-control` | mineure | clic sans requete, sans changement d'ecran, sans message |
| `broken-image` | mineure | image qui ne charge pas (groupee par origine) |
| `horizontal-overflow` | mineure | la page deborde lateralement |

Le detecteur `false-error-empty-body` est celui qui trouve la famille de bugs
« l'action a marche mais l'interface dit que non » : le client passe par
`fetchJSON`, le serveur repond `204 No Content`, `JSON.parse('')` leve, un toast
d'erreur s'affiche alors que la donnee est bien enregistree.

## Architecture

```
run.mjs              # CLI : bac a sable, navigateur, orchestration
src/probe.mjs        # sonde injectee dans la page (toasts, fetch, erreurs JS)
src/dom.mjs          # recensement des controles, empreinte d'etat, defauts visibles
src/crawler.mjs      # moteur : parcours des vues, recursion, budget
src/detect.mjs       # signaux bruts → constats (fonctions pures)
src/issues.mjs       # redaction des issues, deduplication, index
src/locate.mjs       # rattachement d'un constat au code source
src/config.mjs       # bac a sable, priorites, valeurs de saisie
src/publish.mjs      # ouverture des issues GitHub, routage, anti-doublon
src/scrub.mjs        # anonymisation de tout ce qui est publie
export-github.mjs    # republier un rapport deja ecrit
```

Trois idees portent le tout :

1. **La sonde plutot que l'observation externe.** Un toast vit cinq secondes et
   le corps d'une reponse HTTP n'est pas relisible depuis Node. Un script
   injecte avant le rendu capture les deux au vol, l'automate le vide apres
   chaque action : un signal appartient a une action et une seule.

2. **L'identite des controles par marquage.** Les classes generees par Svelte
   changent au moindre re-rendu. Chaque element recense recoit un
   `data-crawl-id` pose dans la page, seul point d'ancrage stable.

3. **La recursion sur changement d'etat.** Un clic qui change l'ecran ouvre un
   nouvel etat a explorer avant de revenir en arriere. C'est ce qui mene a la
   fiche album, puis a ses etoiles de notation, sans qu'une seule ligne de
   l'automate ne parle de notation.

Les cartes d'album ne sont ni des `button` ni des `a` : Svelte pose ses
gestionnaires par `addEventListener` sur des `div`. Le recensement les trouve
par leur curseur (`cursor: pointer`), en ne gardant que le conteneur le plus
externe de chaque zone cliquable.

## Verification ciblee

`check-rating.mjs` rejoue le parcours de notation dans le navigateur et dit ce
que l'UI affiche a chaque etape :

```bash
node check-rating.mjs --base-url http://127.0.0.1:8888
```

Il sert a ce que l'exploration ne sait pas faire : prouver qu'un defaut a
disparu. Une exploration qui ne signale plus rien ne prouve rien tant qu'on n'a
pas montre qu'elle est bien passee par l'ecran concerne. Le script coupe le son
lui-meme avant d'ouvrir la page, comme `run.mjs`.

## Tests

```bash
npm test    # node --test, sans dependance
```

Les detecteurs (`src/detect.mjs`) sont des fonctions pures et sont couverts :
c'est la partie dont depend la justesse du rapport — un detecteur trop large
noie l'utilisateur, un detecteur trop etroit laisse passer le bug cherche.

## Deduplication

Un defaut present sur 36 albums doit donner une issue, pas 36. Chaque constat
recoit une empreinte qui neutralise ce qui varie (identifiants, libelles,
tailles). L'issue porte alors un compteur d'occurrences et la liste des endroits
ou le defaut a ete revu.

Sont regroupes au-dela de la vue :

- **les messages d'erreur** — un toast identifie son chemin de code (sa cle de
  traduction), pas l'ecran ou il s'affiche ;
- **les controles partages** (barre de lecture, champ de recherche global) ;
- **les images injoignables** de la meme origine.

Un `console.error` n'ouvre une issue que s'il est le seul temoin : quand la meme
action a deja produit une erreur HTTP et un toast, les trois decrivent le meme
defaut.

## Publication des issues

L'automate ouvre lui-meme les issues a la fin d'un passage :

```bash
node run.mjs --serve --publish-dry-run          # voir ce qui serait ouvert
node run.mjs --serve \
  --repo-client renesenses/tune-web-client \
  --repo-server renesenses/tune-server-rust \
  --min-severity low
```

Ou apres coup, a partir d'un rapport deja ecrit :

```bash
node export-github.mjs --dry-run
node export-github.mjs --repo-client … --repo-server … --min-severity low
```

**Repartition client / serveur.** Un defaut dont la cause est la reponse du
serveur (`http-4xx`, `http-5xx`, `network-failure`, `false-error-empty-body`)
part sur le depot serveur ; le reste sur le depot du client web. Les pistes de
code etant toujours cherchees dans le client, l'issue le precise quand elle est
ouverte ailleurs. Un seul `--repo` envoie tout au meme endroit.

**Pas de doublon.** Chaque issue porte son empreinte en pied de corps. Un
passage suivant retrouve les siennes et commente « toujours present » au lieu
d'en rouvrir une. Si la liste des issues existantes est illisible (droits,
reseau), la publication s'interrompt plutot que de risquer des doublons. Une
issue fermee reste reconnue : l'automate ne rouvre pas ce qu'un humain a clos.

**Anonymisation.** Tout ce qui est publie passe par `src/scrub.mjs`. L'automate
explore une application qui decouvre le reseau local : un passage ordinaire
ramasse le modele du televiseur, le nom des enceintes (prenom compris),
l'adresse IP de la machine et le chemin du dossier personnel. Rien de cela
n'aide a corriger un bug, et les depots peuvent etre publics.

| Dans le rapport local | Dans l'issue publiee |
|---|---|
| `AirPods Pro de Jean-Philippe #2` | `<appareil>` |
| `airplay-192.168.1.197-7000` | `<appareil>` |
| `192.168.1.42` | `<ip-locale>` |
| `/Users/<compte>/Library/…` | `~/Library/…` |
| `Chifoomi.local` | `<machine>.local` |
| `http://127.0.0.1:56198` | `http://localhost:8888` |

Les noms d'appareils ne sont pas devines : ils sont demandes au serveur
(`/zones`, `/outputs`, `/devices`) au moment de publier, ce qui donne la liste
exacte de ce qu'il ne faut pas laisser sortir. `--redact nom1,nom2` en ajoute.
Le rapport local, lui, garde tout le detail.

## Limites connues

- Les fonctions derriere une authentification tierce (Tidal, Qobuz…) et
  derriere une licence premium ne sont pas explorees.
- Un ecran atteignable uniquement par glisser-deposer n'est pas atteint.
- `inert-control` produit des faux positifs legitimes : une bascule deja dans
  l'etat vise ne change rien. La severite mineure en tient compte.
- L'automate ne juge pas la justesse d'un affichage : il voit qu'une vue est
  vide, pas qu'elle affiche le mauvais album.
