# Agents Tune — client web

Ces règles s'appliquent aux agents OpenAI/Codex, Claude et aux humains.
Le circuit opérationnel par dépôt est décrit dans la
[table de routage de RELEASE-WORKFLOW.md](https://github.com/renesenses/tune-server-rust/blob/main/docs/RELEASE-WORKFLOW.md#base-des-pr-par-dépôt)
et la publication dans le
[runbook RELEASE-OPERATIONS.md](https://github.com/renesenses/tune-server-rust/blob/main/docs/RELEASE-OPERATIONS.md).
La doctrine générale reste
[`tune-gouvernance/regles/RELEASE.md`](https://github.com/renesenses/tune-gouvernance/blob/main/regles/RELEASE.md).

## Base des PR dans ce dépôt

- Un correctif web vise **`main` par PR**, par défaut, depuis un worktree isolé
  basé sur son SHA actualisé.
- Si un lot `batch/*` ou une RC a été explicitement assigné, partir de sa base
  et y ouvrir la PR. Les lots déjà engagés conservent leur cible.
- Ne pas créer une RC uniquement pour ouvrir un correctif web : la restriction
  « seule une RC peut cibler main » appartient au **serveur**, dont le
  `release-gate` l'impose. Elle ne décrit pas le circuit quotidien du web.
- Une PR intégrée dans `main` n'est pas une publication. Le responsable du
  train fige la version et le SHA web exact dans le manifeste de release.
  Aucun bump dans une PR de correctif unitaire.

## Réservation et coordination

Avant toute modification, actualiser les refs, consulter les issues et leurs
commentaires, les PR ouvertes et les fichiers concernés. Vérifier par contenu
si le correctif existe déjà ; éviter les chevauchements importants.

Lister les labels globaux, puis réserver atomiquement dans **ce dépôt** :

```sh
gh api 'repos/renesenses/tune-web-client/labels?per_page=100' --paginate --jq '.[] | select(.name | startswith("verrou:issue-")) | {name,description}'
gh label create "verrou:issue-N" --repo renesenses/tune-web-client --color 5319E7 --description "personne / fournisseur / run-unique"
gh issue edit N --repo renesenses/tune-web-client --add-label "verrou:issue-N" --add-label en-cours
```

Ne jamais utiliser `--force`. Après un échec de création, vérifier le label
exact avant toute autre conclusion. Un verrou **posé sur son issue** est
intouchable, quel que soit son âge : sa reprise exige un transfert explicite,
y compris entre deux sessions du même fournisseur. La réservation n'est acquise
qu'après une création réussie. Conserver les verrous pendant la revue ; leur
libération suit les règles du dépôt.

### Verrou détaché : conditions de reprise (décision du 23/09/2026)

Un label `verrou:issue-N` **détaché** — existant dans le dépôt mais posé sur
aucune issue — ne réserve plus rien indéfiniment. Il se reprend si, et
seulement si, les **trois** conditions sont réunies :

- **(a)** le label n'est pas posé sur son issue `N` ;
- **(b)** aucune PR ouverte ne cite l'issue `N` ;
- **(c)** plus de **24 h** se sont écoulées depuis la dernière activité **du
  verrou lui-même** — création du label, pose ou retrait du label sur l'issue,
  commentaire de réservation ou de transfert. Un commentaire de tri ou de
  livraison sans rapport avec la réservation ne rajeunit pas un verrou.

```sh
# (a) le label est-il posé sur son issue ?
gh issue view N --repo renesenses/tune-web-client --json labels \
  --jq '[.labels[].name] | index("verrou:issue-N")'
# (b) une PR ouverte cite-t-elle l'issue ?
gh pr list --repo renesenses/tune-web-client --state open --limit 500 \
  --json number,title,body,headRefName --jq '.[] | select((.title + .body + .headRefName) | test("(^|[^0-9])N([^0-9]|$)")) | .number'
# (c) dernière activité du verrou : création du label et évènements de label
gh api 'repos/renesenses/tune-web-client/labels/verrou:issue-N' --jq .created_at
gh api 'repos/renesenses/tune-web-client/issues/N/timeline?per_page=100' --paginate \
  --jq '.[] | select((.event == "labeled" or .event == "unlabeled") and .label.name == "verrou:issue-N") | {created_at, event}'
```

La reprise se **dit** : commentaire de réservation sur l'issue portant la
personne, la session (personne / fournisseur / run unique) et le périmètre, en
indiquant que le verrou détaché est repris au titre de cette règle. Sans ce
commentaire, la reprise n'a pas eu lieu.

Ménage : un verrou détaché remplissant (a), (b) et (c) **dont l'issue est
fermée** ne protège plus rien et peut être supprimé
(`gh label delete verrou:issue-N`). Un verrou détaché dont l'issue est
**ouverte** n'est pas supprimé à la volée : il est repris selon la règle
ci-dessus, ou purgé sur arbitrage humain.

**Pourquoi cette règle.** La rédaction antérieure — « un label existant réserve
l'issue même s'il n'y est pas attaché », sans limite de temps — condamnait à ne
plus jamais être traitées les issues dont le verrou avait survécu à sa session.
Le constat à l'origine de la décision : **207 verrous détachés sur 248**, et
plusieurs sessions arrêtées le 23/09 devant ce texte, à juste titre. Un verrou
protège un travail en cours, pas la mémoire d'un travail fini.

Après acquisition, commenter avec personne / fournisseur / run unique,
périmètre, fichiers prévus, branche, SHA de base et worktree Shrek.
Pour JP : `JP Robbe / OpenAI Codex / jp-robbe-<date>-<run-unique>`.
« OpenAI/Codex » seul n'identifie pas une session.

## Validation et livraison

- Développement et validations locales sur Shrek, dans son propre worktree ;
  respecter les consignes de ressources et ne pas modifier les espaces d'autrui.
- Exécuter les contrôles adaptés et décrire leurs limites dans la PR. La CI web
  exécute `npm ci`, `npm test` et `npm run build` pour toutes les PR, même vers
  un lot : le profil rapide du serveur ne s'applique pas à ce dépôt.
- Demander `ci:full` pour les changements CI, release ou transversaux.
- Pour un correctif comportemental, conserver les tests, retirer seulement le
  correctif et vérifier un échec comportemental compilable. Restaurer par copie
  et revenir au vert. Documenter commande, témoin et assertion dans la PR.
- Nommer l'issue, l'identité de session, la base, les dépendances, les preuves et
  les reliquats. Une CI verte ou un état `CLEAN` ne prouve pas une livraison.
  Fermer un ticket de défaut sur preuve de livraison dans un artefact publié,
  conformément aux critères du ticket, pas seulement après son merge.

## Limites de l'agent

- Aucun push direct dans `main` ou `rc/*`, aucun merge, tag ou déploiement.
- Sans instruction humaine explicite portant sur l'étape précise, ne modifier
  ni protection, ni environnement, ni secret, ni variable d'armement.
- Un dry-run vert n'autorise pas à franchir le STOP humain de publication.
- Un échec, un check absent ou une situation inconnue bloque la promotion.

Le contrôleur serveur épingle le SHA exact du client web dans le manifeste.
Le tag du composant ne peut être créé qu'après que ce SHA est devenu atteignable
depuis `main`. Les consignes locales peuvent renforcer ces protections ; le
routage propre à chaque dépôt ne permet pas de les contourner.
