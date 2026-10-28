// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { dialogs } from '../stores/dialogs';
import { fetchJSON } from '../api';
import { carteMusique, carteDepuisObjet, carteDepuisPiste, envoyerMessage, lireMessages, longueurMessage, messageEnvoyable, demandeConversation, messagerieSupport } from '../circleMessagerie';

vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
const appel = vi.mocked(fetchJSON);
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
let absent = false;
let messages = [
  { id: 4, sender_id: 9, mine: true, body: 'Mon message', card: null, created_at: '' },
  { id: 3, sender_id: 7, mine: false, body: '<script>secret()</script>', card: { type: 'album', title: 'Kind of Blue', file_path: '/secret/music.flac', cover_url: 'https://tracker.invalid/pixel' }, created_at: '' },
];
const conv = { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Alice' }, unread_count: 2, last_message: messages[0] };
const finir = async () => { for (let n = 0; n < 5; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const bouton = (s: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === s)!;
beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  absent = false; demandeConversation.set(null); messagerieSupport.set(null); appel.mockReset();
  messages = [
    { id: 4, sender_id: 9, mine: true, body: 'Mon message', card: null, created_at: '' },
    { id: 3, sender_id: 7, mine: false, body: '<script>secret()</script>', card: { type: 'album', title: 'Kind of Blue', file_path: '/secret/music.flac', cover_url: 'https://tracker.invalid/pixel' }, created_at: '' },
  ];
  appel.mockImplementation(async (url: any, options: any) => {
    if (absent) throw Object.assign(new Error('absent'), { status: 404 });
    const u = String(url); const m = options?.method ?? 'GET';
    if (u.endsWith('/conversations')) return { conversations: [conv] } as any;
    if (u.includes('/contacts/7/conversation')) return conv as any;
    if (u.includes('/messages?')) return { conversation: conv, messages, next_cursor: 'opaque +/=' } as any;
    if (m === 'DELETE') { messages = messages.filter((v) => v.id !== 4); return undefined as any; }
    if (u.endsWith('/messages') && m === 'POST') return { id: 5 } as any;
    if (u.endsWith('/reports')) return { id: 31, status: 'pending' } as any;
    return { unread_count: 0 } as any;
  });
  hote = document.createElement('div'); document.body.append(hote);
});
afterEach(async () => { if (vue) await unmount(vue); vue = null; hote.remove(); vi.restoreAllMocks(); });

it('ne laisse sortir aucun chemin, URL locale ou champ inattendu des cartes', async () => {
  const c = carteMusique({ type: 'album', title: 'Kind of Blue', file_path: '/home/me/a.flac', audio: 'secret', cover_url: 'http://192.168.1.18/cover', qobuz_id: 123, local_id: 5 });
  expect(c).toEqual({ type: 'album', title: 'Kind of Blue', qobuz_id: '123' });
  expect(carteDepuisObjet({ type: 'playlist', nom: 'Jazz', sourceId: '/music/a', service: 'local', pochette: '/cover' })).toEqual({ type: 'playlist', title: 'Jazz' });
  expect(carteDepuisPiste({ title: 'So What', file_path: '/secret/a', source: 'qobuz', source_id: '123' })).toEqual({ type: 'track', title: 'So What', qobuz_id: '123' });
  await envoyerMessage(12, ' Écoute ', { ...c!, file_path: '/secret' } as any);
  const options = appel.mock.calls.at(-1)?.[1];
  expect(JSON.parse(options?.body as string)).toEqual({ body: 'Écoute', card: c });
  expect(appel.mock.calls.at(-1)?.[3]).toBe(true);
});

it('borne à 4000 caractères Unicode et refuse un message vide avant le réseau', async () => {
  expect(longueurMessage('😀'.repeat(4000))).toBe(4000);
  expect(messageEnvoyable('é'.repeat(4000), null)).toBe(true);
  await expect(envoyerMessage(12, 'é'.repeat(4001))).rejects.toThrow();
  await expect(envoyerMessage(12, '   ')).rejects.toThrow();
  expect(appel).not.toHaveBeenCalled();
});

it('transmet le curseur opaque sans le découper ni le réinterpréter', async () => {
  await lireMessages(12, 'opaque +/=');
  expect(new URL(String(appel.mock.calls[0][0]), 'https://test.invalid').searchParams.get('cursor')).toBe('opaque +/=');
});

it('masque la messagerie sur un serveur sans les routes', async () => {
  absent = true; vue = mount(Messagerie, { target: hote }); await finir();
  expect(hote.querySelector('#circle-messages')).toBeNull();
  expect(get(messagerieSupport)).toBe(false);
});

it('ouvre le fil, échappe le texte, marque uniquement les messages affichés et conserve les cartes sans pixel tiers', async () => {
  vue = mount(Messagerie, { target: hote }); await finir();
  (hote.querySelector('.conversation') as HTMLButtonElement).click(); await finir();
  expect(hote.textContent).toContain('<script>secret()</script>');
  expect(hote.querySelector('script')).toBeNull();
  expect(hote.querySelector('.carte img')).toBeNull();
  expect(hote.textContent).not.toContain('/secret/music.flac');
  const lu = appel.mock.calls.find((c) => String(c[0]).endsWith('/read'));
  expect(JSON.parse(lu?.[1]?.body as string)).toEqual({ up_to: 4 });
  expect(hote.textContent).toContain('ne sont pas chiffrés de bout en bout');
  expect(hote.querySelectorAll('.messages li')).toHaveLength(2);
  bouton('Messages précédents').click(); await finir();
  expect(hote.querySelectorAll('.messages li')).toHaveLength(2); // pas de doublons
  expect(appel.mock.calls.some((c) => String(c[0]).includes('cursor=opaque'))).toBe(true);
});

it('envoie, supprime seulement mon message après confirmation et signale les messages choisis', async () => {
  vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
  vue = mount(Messagerie, { target: hote }); await finir();
  demandeConversation.set({ contact: 7 }); await finir();
  const saisie = hote.querySelector('#message-texte') as HTMLTextAreaElement;
  saisie.value = 'Bonjour'; saisie.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
  bouton('Envoyer').click(); await finir();
  expect(appel.mock.calls.some((c) => String(c[0]).endsWith('/messages') && c[1]?.method === 'POST' && JSON.parse(c[1]?.body as string).body === 'Bonjour')).toBe(true);
  expect(hote.querySelectorAll('.messages button').length).toBeGreaterThan(0);
  bouton('Supprimer').click(); await finir();
  expect(appel.mock.calls.some((c) => String(c[0]).endsWith('/messages/4') && c[1]?.method === 'DELETE')).toBe(true);
  expect(appel.mock.calls.some((c) => String(c[0]).endsWith('/messages/3') && c[1]?.method === 'DELETE')).toBe(false);
  const cocher = hote.querySelector('.messages input[type=checkbox]') as HTMLInputElement;
  cocher.checked = true; cocher.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  bouton('Signaler (1)').click(); await finir();
  const formulaire = hote.querySelector('#message-raison')?.closest('form');
  formulaire?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await finir();
  expect(appel.mock.calls.some((c) => String(c[0]).endsWith('/reports') && JSON.parse(c[1]?.body as string).message_ids[0] === 3)).toBe(true);
});

it('retire le contenu du fil quand le contact devient inaccessible', async () => {
  vue = mount(Messagerie, { target: hote }); await finir();
  (hote.querySelector('.conversation') as HTMLButtonElement).click(); await finir();
  expect(hote.textContent).toContain('Mon message');
  absent = true;
  (hote.querySelector('.conversation') as HTMLButtonElement).click(); await finir();
  expect(hote.querySelector('.messages')).toBeNull();
  expect(hote.textContent).not.toContain('Mon message');
});
