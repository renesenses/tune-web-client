/**
 * Point d'entrée de DÉVELOPPEMENT de Nocturne (voir `index.html` à côté) :
 * la coquille seule, en mode autonome, sans les écrans de Tune.
 *
 * En usage réel, Nocturne est montée par `ShellV2` quand Réglages › Général ›
 * Interface vaut « Nocturne » (registre `INTERFACES` de `lib/interfaceSalon.ts`).
 */
import '../../../lib/intercepteurRelais';
// Polices et jetons de fondation : main.ts les charge dans l'application.
import '../../../styles/polices.css';
import '../../../styles/fondations.css';
import { mount } from 'svelte';
import { get } from 'svelte/store';
import { preferences } from '../../../lib/stores/preferences';
import { preparerLocale } from '../../../lib/i18n';
import ShellNocturne from '../ShellNocturne.svelte';
import type { EcranNocturne } from '../navigationNocturne';

const p = new URLSearchParams(window.location.search);
const id = Number(p.get('id'));
const nom = p.get('ecran');
const cle = p.get('cle');
const ecranInitial: EcranNocturne =
  (nom === 'album' || nom === 'artiste') && Number.isFinite(id) && id > 0
    ? { nom, id }
    : nom === 'albums' || nom === 'artistes' || nom === 'lecture'
      ? { nom }
      : nom === 'genres' || nom === 'fichiers'
        ? { nom }
        : nom === 'genre' && p.get('genre')
          ? { nom, genre: p.get('genre') as string }
      : nom === 'collection' && cle
        ? { nom, cle: cle as Extract<EcranNocturne, { nom: 'collection' }>['cle'] }
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
      biblioInitiale: p.get('biblio') === '0' ? true : null,
    },
  });
});
