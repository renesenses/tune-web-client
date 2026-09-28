---
description: Traiter une issue du client web de bout en bout (verrou, correctif, preuve, PR vers main)
argument-hint: <numéro d'issue>
---

Traite l'issue renesenses/tune-web-client#$ARGUMENTS en suivant `AGENTS.md`,
puis les règles ci-dessous. Elles valent pour toute session autonome, et en
particulier pour une session cloud, qui ne voit rien d'autre que ce dépôt.

## 1. Avant de toucher au code

- Lis l'issue **et tous ses commentaires**. Si elle demande une nouvelle
  fonctionnalité, un choix d'interface, un changement de comportement ou une
  dépendance nouvelle, **arrête-toi** : c'est une décision de Bertrand. Pose-la
  en une question précise en commentaire de l'issue, sans rien coder.
- Ne traite que des **défauts dont la cause est établie** ou établissable en
  lisant le code.
- Si l'issue touche à la **sécurité** (faille, fuite, contournement
  d'authentification), n'écris **rien** de public : ni commentaire, ni PR, ni
  message de commit détaillé. Arrête-toi et dis-le dans ta réponse finale.
- Vérifie qu'aucune PR ouverte ne couvre déjà l'issue, et que le correctif
  n'existe pas déjà dans `origin/main` : cherche **par contenu**, pas seulement
  par numéro.
- Prends le verrou comme `AGENTS.md` l'indique : `gh label create
  "verrou:issue-N"`. Un échec veut dire que l'issue est prise : arrête-toi.
  Identité de session : `Claude Code cloud / <date> / <id de session>`.

## 2. Le correctif

- Branche depuis `origin/main` à jour, PR vers `main`.
- Le plus petit changement qui corrige la cause. Pas de réécriture voisine.
- Toute chaîne visible passe par l'i18n, **dans les 11 langues** de
  `src/lib/locales/`.
- Ajoute un test qui **échoue sans le correctif**. Prouve-le : retire le
  correctif en gardant le test, constate le rouge, restaure, constate le vert.
  Consigne la commande et l'assertion dans la PR.

## 3. Les contrôles

```sh
npm ci
npm test          # six contrôleurs + vitest, pas seulement vitest
npm run build
```

Compte les échecs sur la **ligne de résumé** (`Test Files` / `Tests`), jamais
en devinant depuis quelques lignes rouges.

## 4. La PR

- Titre `fix(<zone>): <ce qui change pour l'utilisateur> (#N)`.
- Corps : objet, cause, changement, preuves (dont la contre-épreuve), limites
  (ce qui n'a pas été vérifié, par exemple aucune écoute réelle).
- **Aucune fusion, aucun tag, aucun déploiement, aucune modification de
  version.** La fusion appartient à Bertrand.
- Laisse le verrou en place pendant la revue.

## 5. Réponse finale

Une ligne par point : issue, PR (lien), preuves, ce qui reste à vérifier, et
toute question pour Bertrand.
