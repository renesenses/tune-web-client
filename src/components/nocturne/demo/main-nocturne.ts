/**
 * Point d'entrée de DÉVELOPPEMENT de Nocturne (voir `index.html` à côté).
 *
 * ── Brancher Nocturne au sélecteur d'interfaces (après la fusion de Salon) ──
 *  1. Dans le registre d'interfaces, ajouter l'entrée `nocturne` (libellé i18n
 *     à créer : `interfaces.nocturne`), à côté de `v2` et de `salon`.
 *  2. Là où `main.ts` (ou le registre) choisit la coquille à monter, importer
 *     paresseusement `components/nocturne/ShellNocturne.svelte` et la monter
 *     sur `#app` à la place de `ShellV2`, sans propriété.
 *  3. Le choix se fait dans Réglages › Interface comme pour Salon ; aucune autre
 *     modification : Nocturne lit les magasins partagés et amorce lui-même
 *     zones, bibliothèque et transport (mêmes appels que ShellV2).
 *  4. Le jeton `--noc-*` et la police vivent sous `.nocturne` : aucune fuite
 *     de style vers les autres interfaces.
 *  5. Vérifier ensuite que la connexion (écran de login), l'assistant de
 *     première installation et le calque de session expirée — montés par
 *     ShellV2 — sont montés AUSSI autour de Nocturne, ou par le registre.
 */
import '../../../lib/intercepteurRelais';
import { mount } from 'svelte';
import { get } from 'svelte/store';
import { preferences } from '../../../lib/stores/preferences';
import { preparerLocale } from '../../../lib/i18n';
import ShellNocturne from '../ShellNocturne.svelte';
import type { EcranNocturne } from '../navigationNocturne';

const p = new URLSearchParams(window.location.search);
const id = Number(p.get('id'));
const nom = p.get('ecran');
const ecranInitial: EcranNocturne =
  (nom === 'album' || nom === 'artiste') && Number.isFinite(id) && id > 0
    ? { nom, id }
    : nom === 'albums' || nom === 'artistes'
      ? { nom }
      : { nom: 'accueil' };
const theme = p.get('theme');

preparerLocale(get(preferences).language ?? 'en').then(() => {
  mount(ShellNocturne, {
    target: document.getElementById('app')!,
    props: {
      ecranInitial,
      themeInitial: theme === 'clair' || theme === 'sombre' ? theme : null,
      fileInitiale: p.get('file') === '1',
      tiroirInitial: p.get('tiroir') === '1',
    },
  });
});
