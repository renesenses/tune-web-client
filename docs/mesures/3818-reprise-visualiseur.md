# #3818 / web #1187 — reprise du visualiseur après pause courte

JP Robbe / OpenAI Codex / jp-robbe-20260918-suite7-3818

## Périmètre

Base : 4476ce7daf505c117c2add58f31ad446115cb80c.
Branche : fix/jp-robbe-20260918-3818-visualizer.
Lot : batch/jp-p2-visualizer-20260918.
Développement, installation et validations exclusivement sur Shrek, Node 22.23.2,
Vitest 4.1.9, au plus deux workers. Aucun changement de dépendance ou du serveur.

Le fil serveur #3818 décrit un visualiseur qui ne revient pas lors d'une bascule.
Le défaut démontré ici concerne une séquence précise, distincte d'une bascule
continue entre les deux modes : lecture en forme d'onde, pause, exécution du
rappel de dessin qui vide l'historique, puis reprise avant le masquage à 2500 ms.
La visibilité et le canvas restent identiques. L'ancien rappel est consommé mais
son identifiant reste stocké, et l'effet de reprise ne planifie aucun dessin.

Le composant remet maintenant cet identifiant à null à l'entrée du rappel et
redémarre la boucle depuis l'effet de lecture, si le canvas existe. Les gardes
testent explicitement null, car zéro peut être un identifiant rAF valide.
Le garde existant empêche de créer une seconde boucle lorsque des niveaux
arrivent ou que le mode change. La décroissance et le délai de masquage restent
inchangés.

## Témoins comportementaux

La cible src/lib/__tests__/audioVisualizer3818.test.ts est enregistrée par le
motif Vitest existant src/**/*.test.ts. Elle monte directement AudioVisualizer
avec Svelte, utilise de vraies propriétés réactives et fournit les niveaux au
store de production handleAudioLevelsEvent. Seules les frontières navigateur
sont simulées : horloge, file requestAnimationFrame, contexte canvas et
ResizeObserver. Aucune requête réseau ni lecture audio n'est effectuée.

Les cinq témoins vérifient :
1. une pause courte de 200 ms puis reprise produit de nouveaux dessins ;
2. une pause de 2600 ms masque le composant, puis la reprise redessine ;
3. plusieurs bascules spectrum/waveform conservent un seul rappel en attente ;
4. un rappel d'identifiant zéro est annulé au démontage ;
5. après reprise et démontage, de nouveaux niveaux ne recréent aucune boucle.

La reprise exige un rappel en attente puis de nouveaux appels de dessin. Les
tests ne se bornent pas à vérifier une variable interne ou du texte source.

## Contre-épreuve et restauration

Commande ciblée : npx vitest run src/lib/__tests__/audioVisualizer3818.test.ts --maxWorkers=2.

- Premier essai : erreur de compilation du helper de test ($state utilisé
  directement dans return), aucun test exécuté. Corrigé par une déclaration
  locale ; cet essai ne constitue pas une contre-épreuve.
- Sources corrigées : 5/5 tests verts, 6,19 s.
- Ancien composant restauré depuis la base, tests inchangés : compilation
  réussie, 3 tests rouges et 2 verts, 6,32 s. La pause courte et le scénario de
  nettoyage échouent lors de la reprise avec zéro rappel obtenu contre un
  attendu. Le démontage d'un rappel zéro laisse un rappel au lieu de zéro.
  Les témoins de pause longue et de changement de mode restent verts.
- Restauration par cp, SHA-256 des trois sources vérifiés : 5/5 verts, 6,07 s.

- npm test -- --maxWorkers=2 : code 0 ; les six gardes passent, dont
  « svelte-check : aucune nouvelle erreur ». Vitest exécute 483 fichiers,
  5079 tests tous verts (dont les cinq nouveaux), en 244,02 s.
- npm run build : code 0, 55,43 s. Les avertissements de compilation et de
  taille des chunks restent visibles dans le journal.
- npm run check, contrôle brut déjà lancé dans la séquence : code 1,
  45 erreurs et 570 avertissements dans 88 fichiers. Le garde officiel
  confirme qu'aucune erreur n'est nouvelle ; aucun diagnostic dans les deux
  nouveaux fichiers de test. AudioVisualizer conserve uniquement ses deux
  avertissements préexistants sur zoneId. Ce contrôle brut n'est donc pas
  présenté comme vert.
- git diff --check : code 0.
La CI existante se déclenche pour toutes les PR et exécute npm ci, npm test,
puis npm run build ; aucun changement de workflow n’est nécessaire.

## Limites

Cette preuve porte sur le cycle de vie du composant avec une horloge
déterministe et des niveaux synthétiques. Elle ne prouve ni la cause exacte du
signalement terrain lors d'une simple bascule, ni la livraison des niveaux par
le serveur, ni un rendu visuel réel dans tous les navigateurs. Le flux absent
côté serveur (#3682), la sélection de zone et les contrats audio sont hors
périmètre. Les deux avertissements Svelte sur la capture initiale de zoneId
étaient présents sur l'ancien et le nouveau composant.

## Preuves conservées

Sur Shrek : /srv/builds/jp-evidence/jp-3818-20260918-suite7.
Journaux : green-1.log (erreur de préparation), green-2.log,
counterproof.log, counterproof.exit, restore-hashes.log,
restored-targeted.log, full-test.log, build.log, check.log et codes de sortie.
before-counterproof.sha256 contient les empreintes des sources vertes et
restore-hashes.log leurs trois vérifications après restauration.
