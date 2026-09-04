import './styles/tune-theme.css';
import App from './App.svelte';
import ShellV2 from './components/v2/ShellV2.svelte';
import { mount } from 'svelte';
import { futureInterface } from './lib/interfaceChoisie';

// Quelle interface monter : l'ACTUELLE, ou la FUTURE v1 (direction Levente).
//
// La règle vit dans `lib/interfaceChoisie` plutôt qu'ici : elle a trois cas —
// forçage par l'URL, choix mémorisé par l'appareil, défaut — et un défaut de
// cascade se verrait à l'écran comme une page blanche, jamais dans une pile
// d'appel. Hors de ce fichier, elle est éprouvable sans monter l'application.
//
// `?v2` force la future, `?v2=0` force l'actuelle : c'est l'issue de secours
// si un écran de la future rendait le menu de retour inatteignable.
const app = mount(futureInterface() ? ShellV2 : App, {
  target: document.getElementById('app')!,
});

export default app;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
