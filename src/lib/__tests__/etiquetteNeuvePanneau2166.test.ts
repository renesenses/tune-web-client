// @vitest-environment jsdom
//
// web#2166 (serveur : tune-server-rust#6257), décision de Bertrand du 13/10 :
// tant que l'utilisateur n'a rien réordonné, l'ordre des étiquettes reste
// alphabétique et une étiquette neuve s'y range ; dès qu'un ordre a été
// choisi, une neuve va en fin de liste. C'est le SERVEUR qui décide de cette
// place : le panneau d'une pochette, qui crée et pose une étiquette d'un
// geste, doit suivre l'ordre qu'il rend au lieu d'empiler la neuve au bout.
//
// 🔴 Le témoin MONTE le panneau et crée l'étiquette par son champ, comme
// l'utilisateur. Le `fetch` bouchonné range les étiquettes comme le serveur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import EtiquettesPanneau from '../../components/v2/EtiquettesPanneau.svelte';
import { locale } from '../i18n';

vi.setConfig({ testTimeout: 30_000 });

class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }
const respirer = () => new Promise((r) => setTimeout(r, 0));
async function souffler(n = 10) {
  for (let i = 0; i < n; i++) { await respirer(); flushSync(); }
}

type Tag = { id: number; name: string; color: string; position: number };
let tags: Tag[] = [];
let posees: number[] = [];

/** Le rangement du serveur (#6257) : position, puis nom. */
function liste(): Omit<Tag, 'position'>[] {
  return [...tags]
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map(({ id, name, color }) => ({ id, name, color }));
}

function repondre(url: string, method: string, corps: string | undefined): unknown {
  if (method === 'POST' && /\/tags\/?$/.test(url)) {
    const { name } = JSON.parse(corps ?? '{}');
    const max = Math.max(0, ...tags.map((t) => t.position));
    const t = { id: tags.length + 1, name, color: '#808080', position: max > 0 ? max + 1 : 0 };
    tags.push(t);
    return { id: t.id, name: t.name, color: t.color };
  }
  if (method === 'POST' && /\/tags\/\d+\/items$/.test(url)) {
    posees.push(Number(url.match(/\/tags\/(\d+)\/items$/)![1]));
    return {};
  }
  if (/\/tags\/for\/album\/12$/.test(url)) return liste().filter((t) => posees.includes(t.id));
  if (/\/tags\/?(\?.*)?$/.test(url)) return liste();
  return {};
}

let hote: HTMLDivElement;
let monte: Record<string, unknown> | null = null;

beforeEach(() => {
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', ObservateurInerte);
  vi.stubGlobal('IntersectionObserver', ObservateurInerte);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const charge = repondre(url, (init?.method ?? 'GET').toUpperCase(), init?.body as string | undefined);
    return {
      ok: true, status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(charge),
      json: async () => charge,
    } as unknown as Response;
  }));
  hote = document.createElement('div');
  document.body.append(hote);
});

afterEach(() => {
  if (monte) unmount(monte);
  monte = null;
  hote.remove();
  document.querySelectorAll('.fond').forEach((e) => e.remove());
  vi.unstubAllGlobals();
});

async function creerDepuisLePanneau(nom: string): Promise<string[]> {
  monte = mount(EtiquettesPanneau, {
    target: hote, props: { itemType: 'album', itemId: 12, nom: 'x', onClose: () => {} },
  });
  await souffler();
  const champ = document.querySelector('.fond form.creer input') as HTMLInputElement;
  expect(champ, 'le panneau n’a pas de champ « Créer »').toBeTruthy();
  champ.value = nom;
  champ.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  (document.querySelector('.fond form.creer') as HTMLFormElement)
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await souffler(20);
  const premiere = document.querySelector('.fond section ul.puces');
  return [...(premiere?.querySelectorAll('.puce') ?? [])]
    .map((p) => (p.textContent ?? '').replace('×', '').trim());
}

describe('web#2166 — la place d’une étiquette neuve créée depuis le panneau', () => {
  it('🔴 sans ordre choisi, la neuve se range par son nom', async () => {
    tags = [
      { id: 1, name: 'Blues', color: '#808080', position: 0 },
      { id: 2, name: 'Rock', color: '#808080', position: 0 },
    ];
    posees = [1, 2];
    expect(await creerDepuisLePanneau('Jazz'), 'la neuve s’empilait au bout')
      .toEqual(['Blues', 'Jazz', 'Rock']);
  });

  it('un ordre choisi : la neuve va en fin de liste', async () => {
    tags = [
      { id: 1, name: 'Blues', color: '#808080', position: 2 },
      { id: 2, name: 'Rock', color: '#808080', position: 1 },
    ];
    posees = [1, 2];
    expect(await creerDepuisLePanneau('Ambient')).toEqual(['Rock', 'Blues', 'Ambient']);
  });
});
