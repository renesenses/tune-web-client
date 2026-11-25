// @vitest-environment jsdom
//
// Tune Circle rc14 — la photo du contact dans la messagerie (liste et en-tête du fil),
// reprise de `GET /circle` ; sans elle, ou si elle échoue, les initiales.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { fetchJSON } from '../api';
import { noterPhotosContacts } from '../circle';
import { demandeConversation, messagerieSupport } from '../circleMessagerie';

vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
const appel = vi.mocked(fetchJSON);
const PHOTO = 'https://mozaiklabs.fr/storage/avatars/7-512.webp';
const conversations = [
  { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Alice Martin' }, unread_count: 0, last_message: null },
  { id: 13, kind: 'direct', contact: { user_id: 8, name: 'Bruno' }, unread_count: 0, last_message: null },
  { id: 14, kind: 'direct', contact: { user_id: 9, name: 'Denis' }, unread_count: 0, last_message: null },
];
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
const finir = async () => { for (let n = 0; n < 5; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const conv = (nom: string) => [...hote.querySelectorAll('button.conversation')].find((b) => b.querySelector('strong')?.textContent?.trim() === nom) as HTMLElement;
beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  demandeConversation.set(null); messagerieSupport.set(null); appel.mockReset();
  noterPhotosContacts([
    { user_id: 7, name: 'Alice Martin', since: '', avatar_url: PHOTO },
    { user_id: 8, name: 'Bruno', since: '', avatar_url: null },
    { user_id: 9, name: 'Denis', since: '', avatar_url: 'javascript:void(0)' },
  ]);
  appel.mockImplementation(async (url: any) => {
    const u = String(url);
    if (u.endsWith('/conversations')) return { conversations } as any;
    if (u.includes('/messages?')) return { conversation: conversations[0], messages: [], next_cursor: null } as any;
    return { unread_count: 0 } as any;
  });
  hote = document.createElement('div'); document.body.append(hote);
});
afterEach(async () => { if (vue) await unmount(vue); vue = null; hote.remove(); noterPhotosContacts([]); vi.restoreAllMocks(); });

it('liste des conversations : la photo sûre du contact, sinon ses initiales', async () => {
  vue = mount(Messagerie, { target: hote }); await finir();
  const img = conv('Alice Martin').querySelector('.avatar img') as HTMLImageElement;
  expect(img.getAttribute('src')).toBe(PHOTO);
  expect(img.getAttribute('alt')).toBe('');
  expect(img.getAttribute('loading')).toBe('lazy');
  expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(conv('Bruno').querySelector('img')).toBeNull();
  expect(conv('Bruno').querySelector('.avatar')?.textContent?.trim()).toBe('B');
  expect(conv('Denis').querySelector('img')).toBeNull();
  expect(conv('Denis').querySelector('.avatar')?.textContent?.trim()).toBe('D');
  expect(hote.innerHTML).not.toContain('javascript:');
});

it('photo en erreur : les initiales reviennent', async () => {
  vue = mount(Messagerie, { target: hote }); await finir();
  conv('Alice Martin').querySelector('.avatar img')!.dispatchEvent(new Event('error'));
  flushSync();
  expect(conv('Alice Martin').querySelector('img')).toBeNull();
  expect(conv('Alice Martin').querySelector('.avatar')?.textContent?.trim()).toBe('AM');
});
