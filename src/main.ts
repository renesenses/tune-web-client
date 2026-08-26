import './styles/tune-theme.css';
import App from './App.svelte';
import ShellV2 from './components/v2/ShellV2.svelte';
import { mount } from 'svelte';

// Prévisualisation du nouveau client (direction Levente) : `?v2` dans l'URL
// monte la coquille v2 au lieu de l'app historique. Aucun effet hors de ce
// drapeau — l'app normale démarre à l'identique.
const previewV2 = new URLSearchParams(location.search).has('v2');

const app = mount(previewV2 ? ShellV2 : App, {
  target: document.getElementById('app')!,
});

export default app;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
