/**
 * DÉMO — maquettes Tune Circle de Levente (20/11/2026). NE PAS FUSIONNER.
 * Page autonome (`demo-cercle-levente.html`), servie par `vite` en
 * développement : aucun serveur Tune, aucune donnée réelle (`donnees.ts`).
 */
import '../../styles/tune-theme.css';
import { mount } from 'svelte';
import { installerBouchon } from './bouchon';
import { preparerLocale, locale } from '../../lib/i18n';
import { refreshCirclePlugin } from '../../lib/circle';
import { relireNotifications } from '../../lib/circleNotifications';
import Harnais from './Harnais.svelte';

installerBouchon();
const q = new URLSearchParams(location.search);
// Brun : le thème existant le plus proche des maquettes (fond brun-noir, accent or).
document.documentElement.setAttribute('data-v2-theme', q.get('theme') ?? 'brown');

preparerLocale('en').then(async () => {
  locale.set('en');
  await refreshCirclePlugin();
  await relireNotifications();
  mount(Harnais, { target: document.getElementById('app')! });
});
