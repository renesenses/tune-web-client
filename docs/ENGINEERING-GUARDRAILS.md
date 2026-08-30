# Garde-fous d'ingénierie Tune Web Client

POLICY_SUPPORT_DOC: non-authoritative

Ce document conserve les indications techniques propres au client web. Il ne
définit ni permissions, ni topologie de branches, ni release : la politique
canonique est `.github/release-policy.json`.

## Socle et validation

- SPA Svelte 5 ; utiliser les runes `$state`, `$derived` et `$effect` dans les
  composants, et les stores `writable<T>()` pour l'état global.
- Centraliser les appels REST dans `src/lib/api.ts` et les types partagés dans
  `src/lib/types.ts`.
- Respecter les variables CSS de thème et les trois présentations desktop,
  tablette et mobile.
- Avant une PR, exécuter `npm test` puis `npm run build`. Un succès des tests
  ne remplace pas la preuve du build de production.
- Les actifs publiés doivent être produits depuis le SHA web épinglé dans le
  manifeste de release, jamais depuis une branche flottante.

## Confidentialité du dépôt public

Ne jamais mentionner ni développer les fonctions recorder, recording ou
special-edition dans ce dépôt public.
