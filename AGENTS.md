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

Ne jamais utiliser `--force`. Un label existant réserve l'issue même s'il
n'y est pas attaché. Après un échec de création, vérifier le label exact :
présent ou incertain, ne pas commencer cette issue et poursuivre une tâche
indépendante. L'ancienneté d'un verrou n'autorise pas sa reprise ; un transfert
explicite est nécessaire, y compris entre deux sessions du même fournisseur.
La réservation n'est acquise qu'après une création réussie. Conserver les
verrous pendant la revue ; leur libération suit les règles du dépôt.

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
