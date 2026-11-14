import '../../src/styles/tune-theme.css';
import '../../src/styles/tune-v2.css';
import { mount } from 'svelte';
import { get } from 'svelte/store';
import { preparerLocale, locale } from '../../src/lib/i18n';
import { dialogs } from '../../src/lib/stores/dialogs';
import Annuaire from '../../src/components/v2/RadioAnnuaire.svelte';
await preparerLocale('fr');
locale.set('fr');
mount(Annuaire, {target:document.getElementById('app')!});
(window as any).banc = {
  confirmer: () => { const d = get(dialogs)[0]; if (!d) throw Error('Confirmation absente'); dialogs.settle(d.id, true); },
};
