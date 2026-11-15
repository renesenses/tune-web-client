// @vitest-environment jsdom
// rc12 — cercles généraux (site-mozaiklabs#422, décisions de Bertrand du 12/11/2026) :
// fil `general` à côté de la conversation de groupe rc11, auteur en `sender_name`,
// acceptation du pseudo enregistrée par le cloud avant le premier texte ou la première carte.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Dialogues from '../../components/partages/DialogContainer.svelte';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import Generaux from '../../components/v2/CerclesGenerauxV2.svelte';
import Partage from '../../components/v2/PartageMessageV2.svelte';
import { fetchJSON } from '../api';
import { dialogs } from '../stores/dialogs';
import { preparerLocale } from '../i18n';
import { conversations, demandeConversation, messagerieSupport, nomConversation } from '../circleMessagerie';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import el from '../locales/el';
import hu from '../locales/hu';
import ja from '../locales/ja';
import ko from '../locales/ko';
import nb from '../locales/nb';
import pl from '../locales/pl';
import ro from '../locales/ro';
import sv from '../locales/sv';
import vi_ from '../locales/vi';
import zh from '../locales/zh';

vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
const appel = vi.mocked(fetchJSON);
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
let dialogueVue: ReturnType<typeof mount> | null = null;
let besoin = true;
let membre = true;
let sansSite = false;
let confirm: ReturnType<typeof vi.spyOn>;

const direct = { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Alice' }, unread_count: 0 };
// La conversation de groupe rc11, inchangée.
const groupe = { id: 30, kind: 'circle', contact: null, can_write: true, unread_count: 0, circle: { id: 5, name: 'Amis', owner_id: 1, owner_name: 'Olga', mine: false, write: 'all' } };
// Le fil d'un cercle général, tel que le renvoie site-mozaiklabs#422.
const general = () => ({ id: 20, kind: 'general', contact: null, circle: { id: 8, name: 'Jazz modal' }, unread_count: 1, name_consent_required: besoin });
const messagesGeneral = [
  { id: 2, sender_id: 3, sender_name: null, mine: false, body: 'Message d’un ancien membre', card: null, created_at: '2026-11-01T10:01:00Z' },
  { id: 1, sender_id: 9, sender_name: 'Bob', mine: false, body: 'Ancien message', card: null, created_at: '2026-11-01T10:00:00Z' },
];
const finir = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === texte);
const appels = (fin: string, methode = 'POST') => appel.mock.calls.filter((c) => String(c[0]).split('?')[0].endsWith(fin) && (c[1]?.method ?? 'GET') === methode);
const saisir = (texte: string) => { const champ = hote.querySelector('#message-texte') as HTMLTextAreaElement; champ.value = texte; champ.dispatchEvent(new Event('input', { bubbles: true })); flushSync(); };
const ouvrirLeFil = async () => { vue = mount(Messagerie, { target: hote }); await finir(); demandeConversation.set({ general: 8 }); await finir(); };
const pas404 = () => Object.assign(new Error('Not found'), { status: 404, code: 'not_found' });

beforeAll(async () => preparerLocale('fr'));
beforeEach(() => {
  besoin = true; membre = true; sansSite = false;
  demandeConversation.set(null); messagerieSupport.set(null); appel.mockReset();
  confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
  hote = document.createElement('div'); document.body.append(hote);
  appel.mockImplementation(async (url: any, options: any) => {
    const u = String(url); const m = options?.method ?? 'GET';
    if (u.includes('/general-circles') && sansSite) throw pas404();
    if (u.endsWith('/ext/circle')) return { members: [{ user_id: 7, name: 'Alice' }], sent: [], received: [] } as any;
    if (u.endsWith('/general-circles')) return { circles: [{ id: 8, name: 'Jazz modal', category: 'genre', member_count: 3, joined: membre }] } as any;
    if (u.endsWith('/general-circles/8/membership')) { membre = m === 'POST'; return { joined: membre } as any; }
    if (u.endsWith('/general-circles/8/conversation') && m === 'POST') { if (!membre) throw pas404(); return general() as any; }
    if (u.endsWith('/conversations')) return { conversations: membre ? [general(), groupe, direct] : [groupe, direct] } as any;
    if (u.endsWith('/name-consent')) { besoin = false; return { name_consent_required: false } as any; }
    if (u.includes('/conversations/20/messages?')) return { conversation: general(), messages: messagesGeneral, next_cursor: null } as any;
    if (u.includes('/conversations/30/messages?')) return { conversation: groupe, messages: [], next_cursor: null } as any;
    if (u.includes('/conversations/12/messages?')) return { conversation: direct, messages: [], next_cursor: null } as any;
    if (u.endsWith('/conversations/20/messages') && m === 'POST') { if (besoin) throw Object.assign(new Error('refused'), { status: 422, code: 'circle.name_consent_required' }); return { id: 3 } as any; }
    if (u.endsWith('/messages') && m === 'POST') return { id: 3 } as any;
    return { unread_count: 0 } as any;
  });
});
afterEach(async () => {
  if (vue) await unmount(vue); vue = null;
  if (dialogueVue) await unmount(dialogueVue); dialogueVue = null;
  for (const d of get(dialogs)) dialogs.settle(d.id, false);
  hote.remove(); vi.restoreAllMocks();
});

it('lit un fil `general` à côté de la conversation de groupe rc11 et d’un contact, sans les confondre', async () => {
  const l = await conversations();
  expect(l.map((c) => [c.id, c.kind, nomConversation(c)])).toEqual([[20, 'general', '# Jazz modal'], [30, 'circle', '# Amis'], [12, 'direct', 'Alice']]);
  const g = l[0];
  expect(g.kind === 'general' && g.name_consent_required).toBe(true);
  // Un fil général mal formé est écarté, pas pris pour un groupe.
  appel.mockResolvedValueOnce({ conversations: [{ id: 21, kind: 'general', circle: { id: 9, name: '' }, name_consent_required: false }, groupe] } as any);
  expect((await conversations()).map((c) => c.kind)).toEqual(['circle']);
});

it('affiche l’auteur par `sender_name`, et « Ancien membre » quand il n’est plus là', async () => {
  await ouvrirLeFil();
  expect(appels('/general-circles/8/conversation')).toHaveLength(1);
  expect(hote.querySelector('.fil h3')?.textContent).toBe('# Jazz modal');
  const auteurs = [...hote.querySelectorAll('.auteur')].map((a) => a.textContent);
  expect(auteurs).toEqual(['Bob', 'Ancien membre']);
  expect(hote.textContent).toContain('Tous les membres du cercle lisent tout son historique');
});

it('la conversation de groupe rc11 garde sa route d’envoi', async () => {
  vue = mount(Messagerie, { target: hote }); await finir();
  ([...hote.querySelectorAll('.conversation')][1] as HTMLButtonElement).click(); await finir();
  saisir('Au groupe'); bouton('Envoyer')!.click(); await finir();
  expect(appels('/circles/5/conversation/messages')).toHaveLength(1);
  expect(appels('/name-consent')).toHaveLength(0);
  expect(confirm).not.toHaveBeenCalled();
});

it('refuser l’acceptation du pseudo garde le brouillon et n’envoie rien au cloud', async () => {
  confirm.mockResolvedValue(false);
  await ouvrirLeFil(); saisir('Bonjour le cercle'); bouton('Envoyer')!.click(); await finir();
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Votre pseudo sera visible des membres du cercle Jazz modal'));
  expect(appels('/name-consent')).toHaveLength(0);
  expect(appels('/conversations/20/messages')).toHaveLength(0);
  expect((hote.querySelector('#message-texte') as HTMLTextAreaElement).value).toBe('Bonjour le cercle');
});

it('enregistre l’acceptation côté cloud AVANT le premier texte, une seule fois', async () => {
  await ouvrirLeFil();
  saisir('Premier'); bouton('Envoyer')!.click(); await finir();
  saisir('Deuxième'); bouton('Envoyer')!.click(); await finir();
  const mutations = appel.mock.calls.filter((c) => c[1]?.method === 'POST').map((c) => String(c[0]));
  const consent = mutations.findIndex((u) => u.endsWith('/conversations/20/name-consent'));
  expect(mutations.filter((u) => u.endsWith('/name-consent'))).toHaveLength(1);
  expect(JSON.parse(appels('/name-consent')[0][1]!.body as string)).toEqual({ accepted: true });
  expect(consent).toBeLessThan(mutations.findIndex((u) => u.endsWith('/conversations/20/messages')));
  expect(appels('/conversations/20/messages')).toHaveLength(2);
  expect(confirm).toHaveBeenCalledTimes(1);
});

it('un refus 422 `circle.name_consent_required` du cloud se dit, garde le brouillon et redemande au prochain envoi', async () => {
  besoin = false; // le client croit l'acceptation acquise…
  await ouvrirLeFil();
  besoin = true;  // …mais le cloud ne l'a pas.
  saisir('Sans accord'); bouton('Envoyer')!.click(); await finir();
  expect(hote.querySelector('[role=alert]')?.textContent).toContain('Acceptez d’afficher votre pseudo');
  expect((hote.querySelector('#message-texte') as HTMLTextAreaElement).value).toBe('Sans accord');
  expect(hote.querySelector('.fil')).toBeTruthy();
  expect(confirm).not.toHaveBeenCalled();
  bouton('Envoyer')!.click(); await finir();
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(appels('/name-consent')).toHaveLength(1);
});

it('un échec de l’enregistrement de l’acceptation interdit l’envoi', async () => {
  const normal = appel.getMockImplementation()!;
  appel.mockImplementation(async (...args: any[]) => { if (String(args[0]).endsWith('/name-consent')) throw Object.assign(new Error('refused'), { status: 503 }); return normal(...args as Parameters<typeof fetchJSON>); });
  await ouvrirLeFil(); saisir('Ne pas envoyer'); bouton('Envoyer')!.click(); await finir();
  expect(appels('/conversations/20/messages')).toHaveLength(0);
  expect(hote.querySelector('[role=alert]')).toBeTruthy();
});

it('Entrée pour envoyer ne valide pas aussi le vrai dialogue d’acceptation', async () => {
  confirm.mockRestore();
  await ouvrirLeFil();
  dialogueVue = mount(Dialogues, { target: hote }); await finir();
  saisir('Un envoi demande une acceptation distincte');
  (hote.querySelector('#message-texte') as HTMLTextAreaElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await finir();
  expect(get(dialogs)).toHaveLength(1);
  expect(appels('/name-consent')).toHaveLength(0);
  dialogs.settle(get(dialogs)[0].id, true); await finir();
  expect(appels('/name-consent')).toHaveLength(1);
  expect(appels('/conversations/20/messages')).toHaveLength(1);
});

it('rubrique « Cercles généraux » : rejoindre, écrire au cercle, quitter', async () => {
  membre = false;
  vue = mount(Generaux, { target: hote }); await finir();
  expect(hote.querySelector('h2')?.textContent).toBe('Cercles généraux');
  expect(hote.textContent).toContain('Genre · 3 membres');
  expect(bouton('Écrire au cercle')).toBeUndefined();
  bouton('Rejoindre')!.click(); await finir();
  expect(appels('/general-circles/8/membership')).toHaveLength(1);
  bouton('Écrire au cercle')!.click(); await finir();
  expect(get(demandeConversation)).toEqual({ general: 8 });
  bouton('Quitter')!.click(); await finir();
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Quitter le cercle Jazz modal'), { danger: true });
  expect(appels('/general-circles/8/membership', 'DELETE')).toHaveLength(1);
  expect(bouton('Écrire au cercle')).toBeUndefined();
});

it('quitter retire tout de suite le fil ouvert, sans toucher à la conversation de groupe', async () => {
  await ouvrirLeFil();
  expect(hote.textContent).toContain('Ancien message');
  const g = mount(Generaux, { target: document.body.appendChild(document.createElement('div')) }); await finir();
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Quitter')!.click(); await finir();
  expect(hote.querySelector('.fil')).toBeNull();
  expect(hote.textContent).not.toContain('Ancien message');
  expect([...hote.querySelectorAll('.conversation strong')].map((s) => s.textContent)).toEqual(['# Amis', 'Alice']);
  await unmount(g);
});

it('se masque proprement face à un site sans cercles généraux (404)', async () => {
  sansSite = true;
  vue = mount(Generaux, { target: hote }); await finir();
  expect(hote.querySelector('section')).toBeNull();
  expect(hote.querySelector('[role=alert]')).toBeNull();
});

it('une panne passagère du cloud reste dite, sans masquer la rubrique', async () => {
  const normal = appel.getMockImplementation()!;
  appel.mockImplementation(async (...args: any[]) => { if (String(args[0]).endsWith('/general-circles')) throw Object.assign(new Error('down'), { status: 503 }); return normal(...args as Parameters<typeof fetchJSON>); });
  vue = mount(Generaux, { target: hote }); await finir();
  expect(hote.querySelector('section [role=alert]')).toBeTruthy();
});

it('partage une carte dans un cercle général rejoint, après acceptation enregistrée par le cloud', async () => {
  vue = mount(Partage, { target: hote, props: { carte: { type: 'album', title: 'Kind of Blue' } } }); await finir();
  const select = hote.querySelector('select') as HTMLSelectElement;
  expect([...select.options].map((o) => o.value)).toEqual(['', '7', 'general:8']);
  select.value = 'general:8'; select.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  bouton('Envoyer')!.click(); await finir();
  expect(appels('/general-circles/8/conversation')).toHaveLength(1);
  expect(appels('/name-consent')).toHaveLength(1);
  const mutations = appel.mock.calls.filter((c) => c[1]?.method === 'POST').map((c) => String(c[0]));
  expect(mutations.findIndex((u) => u.endsWith('/name-consent'))).toBeLessThan(mutations.findIndex((u) => u.endsWith('/conversations/20/messages')));
  expect(JSON.parse(appels('/conversations/20/messages')[0][1]!.body as string)).toEqual({ card: { type: 'album', title: 'Kind of Blue' } });
});

it('partager une carte : refuser l’acceptation n’envoie rien', async () => {
  confirm.mockResolvedValue(false);
  vue = mount(Partage, { target: hote, props: { carte: { type: 'album', title: 'Kind of Blue' } } }); await finir();
  const select = hote.querySelector('select') as HTMLSelectElement;
  select.value = 'general:8'; select.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  bouton('Envoyer')!.click(); await finir();
  expect(appels('/name-consent')).toHaveLength(0);
  expect(appels('/conversations/20/messages')).toHaveLength(0);
});

it('le partage reste possible vers un contact face à un site sans cercles généraux', async () => {
  sansSite = true;
  vue = mount(Partage, { target: hote, props: { carte: { type: 'album', title: 'Kind of Blue' } } }); await finir();
  expect([...(hote.querySelector('select') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', '7']);
  expect(hote.querySelector('[role=alert]')).toBeNull();
});

it('a ses textes dans les 15 langues', () => {
  const cles = Object.keys(fr).filter((k) => k.startsWith('v2.circle.general.'));
  expect(cles.length).toBe(14);
  for (const l of [en, de, es, it_, el, hu, ja, ko, nb, pl, ro, sv, vi_, zh] as Record<string, string>[]) {
    for (const k of cles) {
      expect(l[k], k).toBeTruthy();
      for (const jeton of (fr as Record<string, string>)[k].match(/\{\w+\}/g) ?? []) expect(l[k], `${k} ${jeton}`).toContain(jeton);
    }
  }
});
