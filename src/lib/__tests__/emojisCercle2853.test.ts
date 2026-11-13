// @vitest-environment jsdom
// #2853 — emojis dans la messagerie Tune Circle.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import Partage from '../../components/v2/PartageMessageV2.svelte';
import { preparerLocale } from '../i18n';
import { fetchJSON } from '../api';
import { demandeConversation, messagerieSupport, carteAPartager } from '../circleMessagerie';
import { CATEGORIES, chercherEmojis, convertirRaccourcis, emojisSeuls, grandsEmojis, insererEmoji, lireRecents, noterRecent, raccourcisActifs, reglerRaccourcis } from '../emojis';

vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
vi.mock('../circle', async (orig) => ({ ...(await orig<typeof import('../circle')>()), getCercle: vi.fn(async () => ({ connected: true, members: [{ user_id: 7, name: 'Alice' }] })), estConnecte: () => true }));
const appel = vi.mocked(fetchJSON);
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
let messages: any[] = [];
const conv = { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Alice' }, unread_count: 0, last_message: null };
const finir = async () => { for (let n = 0; n < 5; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const touche = (el: Element, key: string) => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); flushSync(); };
const envoyes = () => appel.mock.calls.filter((c) => String(c[0]).endsWith('/messages') && c[1]?.method === 'POST').map((c) => JSON.parse(c[1]?.body as string).body);

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  localStorage.clear(); demandeConversation.set(null); messagerieSupport.set(null); appel.mockReset();
  messages = [
    { id: 1, sender_id: 7, mine: false, body: '🎸🔥', card: null, created_at: '' },
    { id: 2, sender_id: 7, mine: false, body: '👨‍👩‍👧', card: null, created_at: '' },
    { id: 3, sender_id: 7, mine: false, body: 'Super concert 🎶', card: null, created_at: '' },
    { id: 4, sender_id: 7, mine: false, body: '🎵🎵🎵🎵', card: null, created_at: '' },
  ];
  appel.mockImplementation(async (url: any, options: any) => {
    const u = String(url); const m = options?.method ?? 'GET';
    if (u.endsWith('/conversations')) return { conversations: [conv] } as any;
    if (u.includes('/contacts/7/conversation')) return conv as any;
    if (u.includes('/messages?')) return { conversation: conv, messages, next_cursor: null } as any;
    if (u.endsWith('/messages') && m === 'POST') return { id: 9 } as any;
    return { unread_count: 0 } as any;
  });
  hote = document.createElement('div'); document.body.append(hote);
});
afterEach(async () => { if (vue) await unmount(vue); vue = null; hote.remove(); carteAPartager.set(null); });

describe('lib/emojis', () => {
  it('contient les catégories demandées, dont les instruments', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(['smileys', 'gestures', 'hearts', 'music', 'objects']);
    const musique = CATEGORIES.find((c) => c.id === 'music')!.emojis.map((e) => e.e);
    for (const e of ['🎵', '🎶', '🎧', '🎸', '🎹', '🥁', '🎻', '🎷', '🎤']) expect(musique).toContain(e);
  });
  it('cherche en français et en anglais, sans accents', () => {
    expect(chercherEmojis('guitare').map((e) => e.e)).toContain('🎸');
    expect(chercherEmojis('guitar').map((e) => e.e)).toContain('🎸');
    expect(chercherEmojis('coeur rouge').map((e) => e.e)).toContain('❤️');
    expect(chercherEmojis('CASQUE').map((e) => e.e)).toContain('🎧');
    expect(chercherEmojis('zzzzqx')).toEqual([]);
    expect(chercherEmojis('  ')).toEqual([]);
  });
  it('convertit les raccourcis seuls, jamais au milieu d’un mot, d’une heure ou d’une URL', () => {
    expect(convertirRaccourcis(':) salut :D ;) <3')).toBe('🙂 salut 😀 😉 ❤️');
    expect(convertirRaccourcis('bien :-),  oui :(')).toBe('bien 🙂,  oui 🙁');
    for (const v of ['http://x.fr', 'à 10:30', 'a<30', 'f(:)', 'x:)', ':Dans', '<3000']) expect(convertirRaccourcis(v)).toBe(v);
  });
  it('mémorise le réglage des raccourcis et les récents', () => {
    expect(raccourcisActifs()).toBe(true);
    reglerRaccourcis(false); expect(raccourcisActifs()).toBe(false);
    noterRecent('🎸'); noterRecent('🎹'); noterRecent('🎸');
    expect(lireRecents()).toEqual(['🎸', '🎹']);
    localStorage.setItem('tune.circle.emojis.recents', '["<img>", 3, "🎧"]');
    expect(lireRecents()).toEqual(['🎧']);
  });
  it('insère à la position du curseur, en remplaçant la sélection', () => {
    expect(insererEmoji('ab', 1, 1, '🎸')).toEqual({ texte: 'a🎸b', curseur: 3 });
    expect(insererEmoji('abcd', 1, 3, '👨‍👩‍👧')).toEqual({ texte: 'a👨‍👩‍👧d', curseur: 1 + '👨‍👩‍👧'.length });
    expect(insererEmoji('ab', null, null, '🙂')).toEqual({ texte: 'ab🙂', curseur: 4 });
  });
  it('compte les emojis seuls, séquences ZWJ, drapeaux et teintes comptant pour un', () => {
    expect(emojisSeuls('🎸')).toBe(1);
    expect(emojisSeuls(' 🎸 🔥 ')).toBe(2);
    expect(emojisSeuls('👨‍👩‍👧')).toBe(1);
    expect(emojisSeuls('🇫🇷👍🏽❤️')).toBe(3);
    expect(emojisSeuls('🎵🎵🎵🎵')).toBe(4);
    expect(grandsEmojis('🎵🎵🎵🎵')).toBe(false);
    for (const v of ['', 'ok 🎸', '123', '#', '©', 'a']) expect(emojisSeuls(v)).toBe(0);
  });
});

describe('MessagerieCercleV2', () => {
  async function ouvrir() {
    vue = mount(Messagerie, { target: hote }); await finir();
    demandeConversation.set({ contact: 7 }); await finir();
    return hote.querySelector('#message-texte') as HTMLTextAreaElement;
  }
  it('affiche en grand un message de 1 à 3 emojis seuls, pas les autres', async () => {
    await ouvrir();
    const textes = [...hote.querySelectorAll('.messages .texte')];
    expect(textes.map((p) => p.classList.contains('grands-emojis'))).toEqual([true, true, false, false]);
    expect(textes[1].textContent).toBe('👨‍👩‍👧');
  });
  it('insère un emoji au curseur depuis le sélecteur, à la souris', async () => {
    const saisie = await ouvrir();
    saisie.value = 'Salut toi'; saisie.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    saisie.setSelectionRange(5, 5);
    const b = hote.querySelector('.bouton-emoji') as HTMLButtonElement;
    expect(b.getAttribute('aria-label')).toBe('Insérer un emoji');
    b.click(); flushSync(); await finir();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    (hote.querySelector('[aria-label="Musique"]') as HTMLButtonElement).click(); flushSync();
    (hote.querySelector('#message-emojis .emoji[aria-label^="guitare"]') as HTMLButtonElement).click(); await finir();
    expect(saisie.value).toBe('Salut🎸 toi');
    expect(saisie.selectionStart).toBe(5 + '🎸'.length);
    expect(lireRecents()).toEqual(['🎸']);
  });
  it('se pilote au clavier : recherche, flèches, Entrée, Échap', async () => {
    const saisie = await ouvrir();
    (hote.querySelector('.bouton-emoji') as HTMLButtonElement).click(); await finir();
    const recherche = hote.querySelector('#message-emojis input[type=search]') as HTMLInputElement;
    expect(document.activeElement).toBe(recherche);
    recherche.value = 'batterie'; recherche.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    touche(recherche, 'Enter'); await finir();
    expect(saisie.value).toBe('🥁');
    recherche.value = ''; recherche.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    touche(recherche, 'ArrowDown'); await finir();
    const premier = document.activeElement as HTMLButtonElement;
    expect(premier.classList.contains('emoji')).toBe(true);
    touche(premier, 'ArrowRight'); await finir();
    const second = document.activeElement as HTMLButtonElement;
    expect(second).not.toBe(premier);
    expect(second.tabIndex).toBe(0);
    second.click(); await finir();
    expect(Array.from(saisie.value)).toHaveLength(2);
    touche(second, 'Escape'); await finir();
    expect(hote.querySelector('#message-emojis')).toBeNull();
    expect(document.activeElement).toBe(hote.querySelector('.bouton-emoji'));
  });
  it('convertit :) <3 à l’envoi, et plus quand on le désactive', async () => {
    const saisie = await ouvrir();
    saisie.value = 'Merci :) <3 à 10:30'; saisie.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    (hote.querySelector('.envoi') as HTMLButtonElement).click(); await finir();
    expect(envoyes().at(-1)).toBe('Merci 🙂 ❤️ à 10:30');
    (hote.querySelector('.bouton-emoji') as HTMLButtonElement).click(); await finir();
    const option = hote.querySelector('#message-emojis input[type=checkbox]') as HTMLInputElement;
    expect(option.checked).toBe(true);
    option.click(); flushSync();
    saisie.value = 'Merci :)'; saisie.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    (hote.querySelector('.envoi') as HTMLButtonElement).click(); await finir();
    expect(envoyes().at(-1)).toBe('Merci :)');
  });
  it('envoie une séquence ZWJ intacte', async () => {
    const saisie = await ouvrir();
    saisie.value = '👨‍👩‍👧 🏴󠁧󠁢󠁳󠁣󠁴󠁿'; saisie.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    (hote.querySelector('.envoi') as HTMLButtonElement).click(); await finir();
    expect(envoyes().at(-1)).toBe('👨‍👩‍👧 🏴󠁧󠁢󠁳󠁣󠁴󠁿');
  });
});

it('ne donne pas le focus à la recherche sur écran tactile (clavier virtuel)', async () => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('hover: none'), media: q, addEventListener() {}, removeEventListener() {} }));
  try {
    vue = mount(Messagerie, { target: hote }); await finir();
    demandeConversation.set({ contact: 7 }); await finir();
    (hote.querySelector('.bouton-emoji') as HTMLButtonElement).click(); await finir();
    expect(hote.querySelector('#message-emojis')).not.toBeNull();
    expect(document.activeElement).not.toBe(hote.querySelector('#message-emojis input[type=search]'));
  } finally { vi.unstubAllGlobals(); }
});

describe('PartageMessageV2', () => {
  it('a le même sélecteur ; Échap ferme le sélecteur sans fermer la fenêtre de partage', async () => {
    carteAPartager.set({ type: 'album', title: 'Kind of Blue' });
    vue = mount(Partage, { target: hote, props: { carte: { type: 'album', title: 'Kind of Blue' } } }); await finir();
    const saisie = hote.querySelector('#message-partage-texte') as HTMLTextAreaElement;
    (hote.querySelector('.bouton-emoji') as HTMLButtonElement).click(); await finir();
    const recherche = hote.querySelector('#partage-emojis input[type=search]') as HTMLInputElement;
    recherche.value = 'headphones'; recherche.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    touche(recherche, 'Enter'); await finir();
    expect(saisie.value).toBe('🎧');
    const option = hote.querySelector('#partage-emojis input[type=checkbox]') as HTMLInputElement;
    const entree = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    option.dispatchEvent(entree);
    expect(entree.defaultPrevented).toBe(true); // Entrée sur la case n'envoie pas le formulaire
    touche(recherche, 'Escape'); await finir();
    expect(hote.querySelector('#partage-emojis')).toBeNull();
    let ouverte: unknown; carteAPartager.subscribe((v) => ouverte = v)();
    expect(ouverte).not.toBeNull();
  });
});

describe('suggestions explicites #2982', () => {
  async function ouvrir(partage = false) {
    if (partage) {
      carteAPartager.set({ type: 'album', title: 'Kind of Blue' });
      vue = mount(Partage, { target: hote, props: { carte: { type: 'album', title: 'Kind of Blue' } } });
    } else {
      vue = mount(Messagerie, { target: hote }); await finir();
      demandeConversation.set({ contact: 7 });
    }
    await finir();
    return hote.querySelector(partage ? '#message-partage-texte' : '#message-texte') as HTMLTextAreaElement;
  }
  async function taper(el: HTMLTextAreaElement, texte: string) {
    el.focus(); el.value = texte; el.setSelectionRange(texte.length, texte.length);
    el.dispatchEvent(new Event('input', { bubbles: true })); await finir();
  }
  it.each([false, true])('Tab ajoute après hello sans envoyer, partage=%s', async (partage) => {
    const el = await ouvrir(partage); await taper(el, 'hello');
    expect(hote.querySelector('[data-suggestion-emoji]')?.textContent ?? '', 'hello doit proposer la main sans envoyer').toContain('👋');
    expect(envoyes()).toEqual([]);
    touche(el, 'Tab'); await finir();
    expect(el.value).toBe('hello 👋');
    expect(el.selectionStart).toBe(el.value.length);
    expect(envoyes()).toEqual([]);
    expect(hote.querySelector('[data-suggestion-emoji]')).toBeNull();
  });
  it('propose un mot français sans accents et accepte le clic', async () => {
    const el = await ouvrir(); await taper(el, 'coeur');
    const bouton = hote.querySelector('[data-suggestion-emoji] button') as HTMLButtonElement;
    expect(bouton).not.toBeNull(); bouton.click(); await finir();
    expect(el.value).toMatch(/^coeur .+/u); expect(envoyes()).toEqual([]);
  });
  it('Échap ignore la suggestion sans fermer le partage', async () => {
    const el = await ouvrir(true); await taper(el, 'hello');
    touche(el, 'Escape'); await finir();
    expect(el.value).toBe('hello'); expect(hote.querySelector('[data-suggestion-emoji]')).toBeNull();
    let carte: unknown; carteAPartager.subscribe((v) => carte = v)(); expect(carte).not.toBeNull();
    expect(envoyes()).toEqual([]);
  });
  it('ne détourne pas Tab pendant une composition, une sélection ou après un préfixe', async () => {
    const el = await ouvrir(); await taper(el, 'hel');
    expect(hote.querySelector('[data-suggestion-emoji]')).toBeNull();
    await taper(el, 'hello'); el.setSelectionRange(0, 5); el.dispatchEvent(new Event('select')); await finir();
    expect(hote.querySelector('[data-suggestion-emoji]')).toBeNull();
    await taper(el, 'hello'); el.dispatchEvent(new CompositionEvent('compositionstart')); await finir();
    touche(el, 'Tab'); await finir(); expect(el.value).toBe('hello');
    el.dispatchEvent(new CompositionEvent('compositionend')); await finir();
    expect(hote.querySelector('[data-suggestion-emoji]')).not.toBeNull();
    expect(envoyes()).toEqual([]);
  });
  it('le réglage du sélecteur désactive les suggestions et persiste', async () => {
    const el = await ouvrir(); await taper(el, 'hello');
    (hote.querySelector('.bouton-emoji') as HTMLButtonElement).click(); await finir();
    const option = hote.querySelector('[data-option-suggestions]') as HTMLInputElement;
    expect(option.checked).toBe(true); option.click(); await finir();
    touche(option, 'Escape'); await finir(); await taper(el, 'hello');
    expect(hote.querySelector('[data-suggestion-emoji]')).toBeNull();
    expect(localStorage.getItem('tune.circle.emojis.suggestions')).toBe('non');
    expect(envoyes()).toEqual([]);
  });
});
