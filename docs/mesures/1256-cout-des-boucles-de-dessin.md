# #1256 — laquelle des quatre boucles de dessin coûte, mesurée

Bertrand / Claude / campagne-20260922-t4-web — 23 septembre 2026.
Base : `main` @ `44ec7a56` (client web de la v0.9.162).
Outil : `tools/banc-boucles-dessin/`, rejouable.

Le ticket dit, en toutes lettres : « **Aucune cause n'est démontrée.** Les quatre
boucles canvas sont un *fait de code* ; qu'elles soient la dépense mesurée est
une *hypothèse non vérifiée*. Personne n'a profilé la page. » Et : « **Part
respective du spectre, du crête-mètre et du fond flouté : inconnue.** »

Les six mesures demandées à Levente Toth ne sont jamais arrivées. Ce relevé
tranche ce qui peut l'être **sans sa machine** : la part de chacune des quatre
boucles, et le sort de l'hypothèse « fond flouté ». Il ne corrige rien.

## Méthode

Chaque configuration : un Chromium neuf sans écran, une page, 20 s de régime
permanent (la première seconde est jetée), deux relevés indépendants —

- le **temps JS** passé dans les rappels d'animation, mesuré dans la page ;
- le **temps CPU total du navigateur**, tous processus confondus, échantillonné
  par `ps` aux deux bornes de la même fenêtre. C'est l'analogue direct de ce que
  Levente a lu dans le Moniteur d'activité : il inclut la rastérisation et la
  composition, que le JS ne voit pas.

Les composants montés sont les composants **réels**, aux props réelles de leurs
deux sites de montage : `CreteMetre style="dat" hauteur=26` pleine largeur
(`NowPlaying.svelte:1685`), `AudioVisualizer height=80` pleine largeur
(`:2144`), `CreteMetre style="lamps" 56×22` (`TransportBar.svelte:884`),
`AudioVisualizer height=24 mini` (`:888`). `devicePixelRatio` forcé à 2, comme
un écran Retina. Le magasin `audio_levels` est alimenté à 25 Hz, la cadence du
serveur, avec un spectre de 64 bandes.

## Le tableau

Médiane de 3 tours de 20 s. « net » = au-dessus de la page nue (0,027 CPU s/s).

| configuration | rAF/s | ms JS /s | CPU s/s | net |
|---|---|---|---|---|
| page nue, aucune boucle | 0 | 0 | 0,027 | — |
| **le fond flouté SEUL** (`blur(60px)` plein cadre) | 0 | 0 | 0,024 | **−0,003** |
| crête-mètre « lamps » de la barre de transport | 75 | 2,49 | 0,119 | 0,092 |
| spectre mini 24 px de la barre de transport | 74,8 | 9,80 | 0,150 | 0,123 |
| crête-mètre « dat » de Lecture en cours | 75 | 4,59 | 0,135 | 0,108 |
| spectre 80 px pleine largeur de Lecture en cours | 74,9 | 14,52 | 0,150 | 0,123 |
| la même toile en forme d'onde | 75 | 5,11 | 0,128 | 0,101 |
| **les quatre ensemble** | 299,8 | 23,75 | 0,255 | 0,228 |
| **les quatre + le fond flouté = l'écran réel** | 300 | 23,86 | 0,259 | 0,232 |
| idem, **lecture ARRÊTÉE** | **0** | **0** | **0,022** | **−0,005** |

Dispersion des trois tours : quelques pour cent (par exemple 0,138 / 0,135 /
0,135 pour le crête-mètre de Lecture en cours). Le temps CPU *par processus*
s'est montré robuste à la charge de la machine, qui a varié de 50 à 130 pendant
le banc.

## Ce que ça établit

### 1. Le fond flouté ne coûte RIEN — hypothèse n° 5 du ticket écartée

Seul : **−0,003** CPU s/s, c'est-à-dire zéro au bruit près. Sous les quatre
boucles animées : 0,232 contre 0,228, soit **+1,7 %**. Le ticket supposait qu'une
couche animée au-dessus pourrait faire re-composer le `blur(60px)` à chaque
image. **Elle ne le fait pas** : le flou est rasterisé une fois.

C'est la mesure la plus solide du lot, et la plus contre-intuitive : Chromium
sans écran compose **sur le processeur**, donc au pire de sa forme. Un flou qui
ne coûte rien ici ne coûtera pas davantage sur un GPU.

### 2. À l'arrêt, tout s'arrête vraiment

Lecture arrêtée, écran ouvert : **0 rappel d'animation par seconde**, 0,022 CPU
s/s — sous le plancher de la page nue. Les quatre boucles s'éteignent.

C'était la **question n° 3** à poser à Levente (« les chiffres sont-ils les mêmes
lecture arrêtée ? »). Elle n'a plus à lui être posée pour la .162 : la réponse
est non, et de loin. Attention, sa mesure à lui date de la **0.9.155**, où
`CreteMetre` ne s'arrêtait jamais (corrigé par #1269, livré en .158).

### 3. La dépense est d'abord par IMAGE, pas par boucle

Le fait le plus utile du tableau, et le moins attendu : **une boucle seule coûte
0,09 à 0,12 ; les quatre ensemble coûtent 0,228** — pas quatre fois plus, à peine
deux fois. La somme des quatre mesures isolées (0,446) est le double de la mesure
des quatre ensemble.

Séparons un coût FIXE `F` — faire tourner le cycle d'image de la page à la
fréquence de l'écran — et le dessin propre `d` de chaque toile :

| | net mesuré | dont fixe | dont dessin |
|---|---|---|---|
| crête-mètre « lamps » (barre) | 0,092 | 0,073 | **0,019** |
| crête-mètre « dat » (Lecture en cours) | 0,108 | 0,073 | **0,035** |
| spectre mini (barre) | 0,123 | 0,073 | **0,050** |
| spectre 80 px (Lecture en cours) | 0,123 | 0,073 | **0,050** |
| **les quatre** | **0,228** | **0,073** | **0,155** |

⚠️ **Ce découpage n'est pas une validation** : cinq mesures, cinq inconnues, le
système est exactement déterminé et se résout toujours. Il se valide — ou se
réfute — en mesurant une SIXIÈME configuration que le modèle prédit : l'Accueil,
c'est-à-dire les deux boucles de la barre de transport seules, attendues à
`0,073 + 0,019 + 0,050 = 0,142` net. **Cette mesure n'a pas pu être faite**
(voir « Le tour qui n'a rien donné » plus bas). Le modèle reste donc une
lecture cohérente du tableau, pas un fait établi.

Conséquences, si le modèle tient :

- **Le coût fixe pèse un tiers de la facture** (0,073 sur 0,228) et il ne
  dépend d'**aucune** des quatre boucles : il dépend de la fréquence d'IMAGE de
  la page. Or `CreteMetre` (`CreteMetre.svelte:183`) et `AudioVisualizer`
  (`AudioVisualizer.svelte:290-291`) se **ré-arment à chaque image de l'écran**
  alors qu'ils ne DESSINENT qu'à 30 Hz. Un `requestAnimationFrame` en attente
  suffit à faire tourner tout le cycle. Sur le MacBook ProMotion de Levente,
  c'est 120 Hz au lieu des ~75 Hz mesurés ici : ce tiers-là est **sous-estimé
  d'environ 1,6×** dans ce tableau.
- **Éteindre une seule des quatre boucles ne rapporte presque rien**, parce que
  les trois autres continuent de faire produire des images à la page. C'est
  exactement ce que le contournement « crête-mètre = off » propose, et ça
  explique pourquoi il pourrait décevoir.
- Le JavaScript n'est que **9 %** de la dépense (23,86 ms sur 259 ms de CPU par
  seconde). Les 91 % restants sont la rastérisation et la composition des
  toiles. Optimiser le code de dessin (mettre le dégradé en cache, par exemple)
  ne toucherait donc qu'une petite part d'une petite part.

### 4. Entre les quatre, le classement

Par coût de dessin propre : les **deux spectres** (0,050 chacun) pèsent ensemble
autant que tout le reste ; les crête-mètres sont les moins chers (0,019 et
0,035). Et le mode **forme d'onde** est moins cher que le spectre (0,028 contre
0,050) — c'était la question n° 4 à poser au testeur.

Noter que le spectre **mini** de la barre de transport, 24 px de haut et 16
barres, coûte **autant** que celui de Lecture en cours, 80 px et 32 barres avec
son axe de fréquences. La surface n'est donc pas le facteur dominant.

## Le tour qui n'a rien donné — et pourquoi il est écrit ici

Un second passage devait ajouter deux lignes : l'**Accueil** (les deux boucles
de la barre seules, qui valide ou réfute le §3) et la **contre-épreuve
`cadence30`** (les quatre boucles réveillées à 30 Hz au lieu de la fréquence de
l'écran, pour chiffrer ce qu'un correctif rapporterait). Il a tourné pendant que
la charge du Mac oscillait entre 50 et 130, et **ses chiffres sont
inexploitables** :

| configuration | les 3 tours (CPU s/s) | écart |
|---|---|---|
| Accueil, 2 boucles | 0,089 / 0,104 / **0,168** | ×1,9 |
| les quatre + fond | 0,125 / 0,128 / **0,252** | ×2,0 |
| contre-épreuve 30 Hz | 0,139 / 0,233 / **0,253** | ×1,8 |

Un facteur deux entre deux tours de la même configuration ne mesure plus le
code, il mesure la machine. Pire, la médiane des « quatre + fond » y tombe à
0,128 là où le premier passage, resserré, donnait **0,259** : prendre ces
valeurs pour argent comptant ferait conclure que l'écran coûte deux fois moins
qu'il ne coûte. Rien n'en est retenu. Voir
`feedback_faux_rouge_binaire_tue_sous_saturation`.

**Une seule chose en est gardée, parce qu'elle se COMPTE au lieu de se
chronométrer** : sous `cadence30`, la page passe de **300 à 119 rappels
d'animation par seconde**. Le réveil aligné sur la cadence de dessin fait bien
ce qu'on attend de lui — il divise par 2,5 le nombre d'images que la page
demande.

### 🔴 Et pourtant la contre-épreuve coûte PLUS CHER, deux fois sur deux

| passage | les 4 boucles | la même chose à 30 Hz |
|---|---|---|
| tour complémentaire (médiane de 3, 15 s) | 0,128 | **0,233** |
| passage court (1 tour, 8 s, machine plus calme) | 0,169 | **0,219** |

Les valeurs ne valent rien ici, mais **le signe est le même dans les deux
passages, et il est contraire à l'attendu**. Deux fois moins d'images
demandées, et la facture monte.

L'explication tient à la méthode, et elle disqualifie la contre-épreuve plutôt
que le levier : `cadence30` remplace `requestAnimationFrame` par un
`setTimeout`. Or `requestAnimationFrame` **coalesce** — les quatre boucles
réveillées sur la même image ne produisent qu'UNE image composée. Quatre
minuteries indépendantes à 30 Hz ne se coalescent pas : elles peuvent produire
jusqu'à quatre images là où il y en avait une. On a donc mesuré la perte de
coalescence, pas le gain de cadence.

**Ce que ça implique pour la suite** est le résultat le plus utile de ce
passage, et c'est un résultat NÉGATIF : le levier du §3 — « moins d'images
demandées » — **ne peut pas être actionné par une minuterie**, et un correctif
qui sortirait de la chaîne `requestAnimationFrame` pour y revenir risque de
coûter plus qu'il ne rapporte. Avant d'écrire un tel correctif, il faut une
contre-épreuve qui garde la coalescence — c'est-à-dire une seule horloge
partagée par les quatre boucles, pas une par boucle. Le banc ne sait pas encore
la faire.

À refaire sur une machine au repos. Le banc porte déjà les deux configurations :

```
cd tools/banc-boucles-dessin
CONFIGS='aucune|barre-seule|les-quatre,fond|les-quatre,fond,cadence30' \
  SECONDES=20 REPETITIONS=5 node pilote.mjs
```

## Ce que ce relevé ne prouve PAS

- **Ce n'est ni Safari ni Firefox, et ce n'est pas son MacBook.** Les valeurs
  absolues ne sont pas les siennes. Ce qui se transporte est le RAPPORT entre
  configurations : même code, même moteur, même fenêtre.
- **Il ne dit pas que ces boucles sont la cause de ce que Levente a mesuré.**
  Il dit ce que chacune coûte, l'une par rapport à l'autre. Sa paire de captures
  Safari reste inexploitable tant qu'on ignore laquelle est l'Accueil
  (question n° 1 du ticket) — et cette question-là, aucun banc ne la remplace.
- **Rien n'est mesuré sur la .155**, la version de son signalement. Entre-temps
  #1269 a livré la cadence et l'arrêt du crête-mètre.
- Le banc tourne **sans écran**. La composition y est faite par le processeur,
  ce qui durcit le verdict sur le flou (§1) mais ne décrit pas la répartition
  CPU/GPU qu'il a lue dans le Moniteur d'activité.

## Ce qu'il reste à demander à Levente — deux questions, pas six

Le banc a répondu aux questions 2 (part du crête-mètre), 3 (à l'arrêt), 4
(spectre vs forme d'onde) et 6 (profil) du ticket. Restent :

1. **Laquelle des deux captures Safari (13:18:01 / 13:18:17) est l'Accueil ?**
   Sans elle, la mesure Safari peut dire une chose et son contraire.
2. **Quelle fréquence de rafraîchissement d'écran** (60 / 120 Hz / ProMotion
   adaptatif) ? C'est elle qui fixe le coût fixe du §3, le seul poste sur lequel
   un correctif aurait prise.

Et une nouvelle, qui n'existait pas avant ce relevé :

3. **En 0.9.162, que reste-t-il de l'écart Accueil / Lecture en cours ?** Deux
   des quatre boucles ont changé de régime depuis la .155.

## La suite, si elle est décidée

Le seul levier que la mesure désigne est le **coût fixe par image**. Mais la
contre-épreuve ci-dessus dit qu'il ne s'actionne **pas** par une minuterie par
boucle : ce qui se gagne en images demandées se reperd, et au-delà, en
coalescence. La piste qui reste est donc **une horloge unique partagée par les
quatre boucles**, à l'intérieur de la chaîne `requestAnimationFrame` — et il
faut la mesurer avant de l'écrire, pas l'inverse.

Rien n'est corrigé ici : le ticket demandait de mesurer d'abord. Et toucher à
`AudioVisualizer` demande de ne pas rouvrir #1187 (« visualiseur figé après une
pause courte », même fichier, défaut inverse : un `animId` laissé non nul qui
fait échouer le garde `if (animId) return`).

Le banc porte la contre-épreuve `cadence30`, qui montre l'effet visé sur le
COMPTE (300 rappels par seconde ramenés à 119) mais qui, sur le COÛT, mesure
autre chose que ce qu'on voulait lui demander.

---

# L'horloge partagée, mesurée — et elle ne rapporte rien

Bertrand / Claude / campagne-20260922-u4-horloge — 23 septembre 2026.
Suite directe de la section précédente, qui laissait cette piste ouverte :
« une seule horloge partagée par les quatre boucles, à l'intérieur de la chaîne
`requestAnimationFrame` — et il faut la mesurer avant de l'écrire ».

C'est fait. **Elle a été mesurée, elle ne rapporte rien, et rien n'a été
écrit.** Ce qui suit est ce résultat et la manière dont il a été obtenu.

## La machine, cette fois

**Shrek** (Linux, 40 cœurs), et non plus le Mac : la section précédente perd un
tour entier faute d'une machine au repos. Chromium **141.0.7390.37** (build
Playwright v1194, le même qu'au premier relevé), sans écran, `dpr=2`, cadence
d'affichage **~60 Hz** (contre ~75 Hz sur le Mac) — les valeurs absolues ne
sont donc pas comparables d'un relevé à l'autre, **les rapports le sont**.

Le banc n'a été lancé qu'une fois la charge retombée : **1,86 au lancement**.
Elle est remontée à 25 pendant le tableau, d'autres travaux ayant repris sur la
machine. La charge est relevée à **chaque tour** et publiée avec la dispersion,
plus bas — c'est ce qui permet de dire quelles lignes tiennent et laquelle ne
tient pas.

## Trois garde-fous ajoutés au banc, sans lesquels il ment

1. 🔴 **La colonne `dessins/s`**, comptée sur `clearRect` — appelé une fois et
   une seule par image réellement peinte (`CreteMetre.svelte:67`,
   `AudioVisualizer.svelte:332`). **C'est elle qui renverse le résultat** : sans
   elle, une des variantes « gagne 41 % » alors qu'elle dessine deux fois moins.
2. Le temps CPU lu dans `/proc/<pid>/stat` et non dans `ps -o time` : sous
   Linux, `ps` ne rend que des **secondes entières**, soit un pas de 0,05 CPU
   s/s sur une fenêtre de 20 s — l'ordre de grandeur de ce qu'on mesure. Deux
   configurations différentes y rendaient le même chiffre.
3. La **charge relevée à chaque tour** et la **dispersion entre tours**,
   imprimées sous le tableau.

## Le tableau — médiane de 4 tours de 20 s, entrelacés

| configuration | rAF/s | tics/s | dessins/s | ms JS /s | CPU s/s | net | par dessin |
|---|---|---|---|---|---|---|---|
| page nue | 0 | 0 | 0 | 0 | 0,020 | — | — |
| **Accueil** : la barre seule, 2 boucles | 120,1 | 120,1 | 60 | 18,07 | 0,151 | 0,131 | 2,18 ms |
| **Lecture en cours** : les 4 + le fond | 240 | 240 | 120 | 42,12 | 0,443 | **0,423** | **3,52 ms** |
| **A** — un seul rAF pour les 4 | 240 | **60** | 120 | 43,26 | 0,449 | 0,429 | 3,57 ms |
| **B** — un seul rAF, dessinateurs à 30 Hz | **119,8** | **60** | 119,8 | 41,89 | 0,440 | 0,420 | 3,51 ms |
| **C** — un seul rAF armé à 30 Hz | 119,4 | **29,8** | ⚠️ **61** | 22,99 | 0,270 | 0,250 | 4,09 ms |
| **E** — l'horloge SEUL cadenceur | 120 | **30** | **120** | 43,87 | 0,449 | **0,429** | **3,58 ms** |
| témoin de C, hors chaîne rAF | 123 | 30,7 | ⚠️ 78,9 | 27,07 | 0,309 | 0,289 | 3,66 ms |
| arbitrage : 20 dessins/s | 80 | 20 | 80 | 29,80 | 0,324 | 0,304 | 3,80 ms |
| arbitrage : 15 dessins/s | 60 | 15 | 60 | 23,34 | 0,262 | 0,242 | 4,03 ms |

`tics/s` = réveils réels de la page. `dessins/s` = images réellement peintes,
toutes toiles confondues. « par dessin » = net ÷ dessins.

## Le résultat, en une ligne

**E fait exactement ce que la piste demandait — une seule horloge, dans la
chaîne rAF, chaque dessinateur à sa cadence utile — et coûte 0,429 contre 0,423
pour le code livré. Soit +1,4 %, dans une dispersion de 11 à 17 %.**

Les réveils de la page passent de **240 à 30 par seconde**, un facteur **8**.
Les rappels d'animation passent de 240 à 120. Le nombre d'images peintes ne
bouge pas (120/s), et **la facture ne bouge pas non plus**. A et B, deux
variantes plus timides de la même idée, donnent le même verdict : 0,429 et
0,420 contre 0,423.

Trois façons différentes de partager l'horloge, trois fois zéro.

## 🔴 Pourquoi il fallait compter les dessins

La variante **C** — un seul rAF, armé seulement quand il faut dessiner — affiche
**0,250 contre 0,423 : −41 %**. C'est le chiffre qu'on aurait publié comme un
gain, et c'est un piège.

C ne fait que **61 dessins par seconde** là où l'écran réel en fait 120. Elle
n'économise pas, elle **dessine moitié moins** : une régression visuelle
présentée comme une optimisation. Rapportée au dessin, elle est même
légèrement **plus chère** que le code livré (4,09 ms contre 3,52).

La cause est un défaut de conception qu'un correctif aurait reproduit tel quel :
**deux cadenceurs en série qui ne tombent pas d'accord**. L'horloge partagée
réveille « vers 33 ms » ; le composant, lui, exige « au moins 33 ms »
(`tempsDeDessiner`, `AudioVisualizer.FRAME_INTERVAL = 33`). Un réveil arrivé à
32,8 ms est jeté, et une image sur deux disparaît. Le témoin hors chaîne rAF
tombe dans le même trou (78,9 dessins/s).

E évite le piège en faisant de l'horloge le **seul** cadenceur — c'est-à-dire
en retirant les garde-fous devenus redondants, exactement ce qu'un correctif
aurait à faire. Et c'est précisément dans cette configuration honnête que le
gain disparaît.

## Ce que ça corrige dans la lecture précédente

Le §3 ci-dessus séparait un **coût fixe par IMAGE** (`F ≈ 0,073`, « faire
tourner le cycle d'image de la page »), pesant un tiers de la facture, et en
tirait le seul levier identifié. Le modèle était annoncé comme « une lecture
cohérente du tableau, pas un fait établi » — cinq mesures pour cinq inconnues.

**La mesure E le réfute.** Elle divise par 8 le nombre d'images que la page
produit et ne récupère rien. S'il existait un coût fixe par image d'un tiers de
la facture, E aurait dû en rendre la plus grande part. Il n'y a pas de coût
fixe par image à récupérer : **la dépense est par DESSIN**, et elle dépend de ce
que la toile contient.

La sous-additivité qui avait suggéré ce coût fixe s'explique autrement, et le
tableau le montre : l'Accueil coûte **2,18 ms par dessin**, Lecture en cours
**3,52 ms**. Les toiles de « Lecture en cours » (spectre 80 px pleine largeur,
crête-mètre « dat ») sont simplement plus chères à peindre que celles de la
barre de transport. Ce n'est pas un coût partagé, c'est une différence de
contenu.

Conséquence pratique, et elle est sèche : **le levier « moins d'images
demandées » n'existe pas**. Ni par minuterie par boucle (mesuré au relevé
précédent : plus cher), ni par horloge partagée (mesuré ici : identique).

## Le seul levier qui reste est un arbitrage produit

Puisque la dépense est par dessin, la seule chose qui la fait baisser est d'en
faire moins :

| cadence | dessins/s | net | gain | par dessin |
|---|---|---|---|---|
| 30 i/s (l'actuelle) | 120 | 0,423 | — | 3,52 ms |
| 20 i/s | 80 | 0,304 | **−28 %** | 3,80 ms |
| 15 i/s | 60 | 0,242 | **−43 %** | 4,03 ms |

C'est **linéaire**, sans seuil ni palier, et ça se lit dans les deux sens :
descendre la cadence paie exactement ce qu'on lui sacrifie de fluidité. **Ce
n'est pas une décision technique** — un crête-mètre à 15 i/s se voit. Elle
revient à Bertrand, et elle n'est pas prise ici.

Noter que ces chiffres valent pour les **quatre** boucles ensemble. Baisser la
cadence des deux seules toiles de la barre de transport, visibles en
permanence, est un arbitrage différent et non mesuré.

## Dispersion et charge — ce qui tient, et ce qui ne tient pas

| configuration | les 4 tours (CPU s/s) | écart | charge à chaque tour |
|---|---|---|---|
| page nue | 0,018 / 0,018 / 0,021 / 0,020 | 13 % | 2,4 / 17,0 / 20,0 / 24,6 |
| **Accueil** | 0,127 / 0,126 / 0,151 / 0,176 | ⚠️ **34 %** | 2,6 / 13,5 / 26,4 / 25,4 |
| **Lecture en cours** | 0,439 / 0,443 / 0,417 / 0,475 | 13 % | 6,5 / 12,3 / 26,1 / 20,5 |
| A | 0,446 / 0,387 / 0,449 / 0,465 | 17 % | 14,3 / 9,8 / 28,0 / 18,0 |
| B | 0,438 / 0,401 / 0,448 / 0,440 | 11 % | 17,3 / 8,0 / 29,8 / 21,9 |
| C | 0,270 / 0,256 / 0,265 / 0,270 | 5 % | 15,9 / 8,1 / 24,1 / 23,0 |
| **E** | 0,425 / 0,427 / 0,476 / 0,449 | 11 % | 12,0 / 8,1 / 21,1 / 23 |
| 20 i/s | 0,318 / 0,329 / 0,324 / 0,250 | 24 % | 9,8 / 9,6 / 21,6 / 18,8 |
| 15 i/s | 0,262 / 0,234 / 0,193 / 0,266 | 28 % | 10,2 / 12,7 / 25,9 / 23 |

La charge est montée de 1,9 à 25 pendant le tableau. **Les tours sont
entrelacés** — chaque configuration est mesurée une fois par tour, dans le même
ordre — de sorte qu'une bourrasque de charge se répartit sur toutes au lieu de
condamner une seule ligne, et la médiane l'absorbe.

**Ce qui tient malgré ça** :

- le **résultat nul** (A, B, E contre le code livré). Les quatre valeurs sont
  dans un mouchoir de 1,4 %, quand la dispersion d'une même configuration est
  de 11 à 17 %. L'effet cherché est très au-dessous du bruit — et son signe est
  même **défavorable**. Un gain réel de 30 % aurait sauté aux yeux ;
- le **balayage de cadence** : 0,423 → 0,304 → 0,242 est monotone, ample, et
  d'un écart bien supérieur à la dispersion ;
- toutes les colonnes qui se **comptent** au lieu de se chronométrer (`rAF/s`,
  `tics/s`, `dessins/s`) : elles sont exactes et insensibles à la charge. C'est
  d'ailleurs sur l'une d'elles que repose le renversement du §« compter les
  dessins ».

**Ce qui ne tient pas** : la ligne **Accueil**, à 34 % d'écart entre tours
(0,127 sur un tour à charge 2,6 et 0,176 sur un tour à charge 25,4). Elle est
donnée pour mémoire ; elle **ne valide ni ne réfute** la prédiction de 0,142 du
§3 — laquelle portait de toute façon sur l'autre machine, à une autre cadence
d'affichage.

## Rejouer

```
# sur Shrek, machine au repos
npx vite build --config tools/banc-boucles-dessin/vite.banc.config.ts
cd tools/banc-boucles-dessin
CHROME_BIN=~/.cache/ms-playwright/chromium-1194/chrome-linux/chrome \
CONFIGS='aucune|les-quatre,fond|les-quatre,fond,horloge-net' \
  SECONDES=20 REPETITIONS=4 node pilote.mjs
```

Les six variantes d'horloge sont des **drapeaux du banc** (`horloge`,
`horloge-saut`, `horloge30`, `horloge25`, `horloge-net`, `horloge30-brut`,
plus `horloge-net20` et `horloge-net15`). **Aucune ne touche au code livré** :
`CreteMetre.svelte` et `AudioVisualizer.svelte` sont montés tels quels, et
c'est `requestAnimationFrame` qui est remplacé autour d'eux.

## Ce que ce relevé ne prouve toujours pas

- Toujours ni Safari ni Firefox, toujours pas le MacBook de Levente. Ce qui se
  transporte reste le **rapport** entre configurations.
- Le banc compose **sur le processeur**. Le partage de l'horloge pourrait avoir
  un effet différent sur un compositeur GPU — mais l'argument qui le rendait
  prometteur (moins d'images produites) est justement celui que la mesure
  écarte, et il ne dépend pas du compositeur.
- Rien de neuf sur la .155, ni sur la question n° 1 du ticket (laquelle des
  deux captures Safari est l'Accueil), qu'aucun banc ne remplace.

## Conclusion, et ce qui est proposé

**Aucun correctif n'est écrit, et c'est le rendu de ce travail.** Le ticket
demandait de mesurer avant d'écrire ; la mesure dit que l'horloge partagée ne
rapporte rien, donc il n'y a rien à écrire. Un correctif publié ici aurait
ajouté un module, deux points de couplage entre composants et un risque de
rouvrir #1187, pour **+1,4 %**.

Ce qui reste sur la table, par ordre de ce que la mesure soutient :

1. **Un arbitrage produit sur la cadence** (30 → 20 → 15 i/s), chiffré
   ci-dessus, à trancher par Bertrand. C'est le seul levier qui paie.
2. **Réduire le coût d'un dessin** — mais le JS n'est que 10 % de la facture
   (42 ms sur 443 ms de CPU par seconde), le reste étant rastérisation et
   composition. Une toile plus petite ou moins de barres toucherait le bon
   poste ; optimiser le code de dessin, non.
3. **Rien du tout**, et refermer la piste « nombre d'images ». Deux mesures
   indépendantes la condamnent maintenant : la minuterie par boucle coûte plus
   cher, l'horloge partagée ne change rien.
