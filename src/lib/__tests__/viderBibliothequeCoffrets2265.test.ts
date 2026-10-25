// @vitest-environment jsdom
//
// « Vider la bibliothèque » doit dire qu'il efface aussi les coffrets composés
// à la main et les éditions d'album — renesenses/tune-web-client#2265.
//
// Didier, fil 2294 : le vidage (`library_clear` → `DELETE FROM albums`, et
// `album_metadata` en cascade) emporte les coffrets composés à la main, leur
// disposition et les éditions d'album. L'aide et la confirmation citaient les
// playlists, les notes, les signets et les favoris, mais pas ces deux pertes.
// Décision de Bertrand (20/10) : les deux textes les citent, rappellent la
// sauvegarde faite juste avant, et disent que l'analyse complète les conserve.
//
// Ces épreuves MONTENT l'écran : elles lisent l'aide affichée et la boîte de
// confirmation réellement ouverte, puis vérifient les douze catalogues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    clearLibrary: vi.fn(async () => ({ ok: true, deleted: 0 })),
    getConfig: vi.fn(async () => ({ music_dirs: [], quality_split: true })),
    getScanSchedule: vi.fn(async () => ({ enabled: false, time: '03:00' })),
    getScanStatus: vi.fn(async () => ({ scanning: false })),
    getScanReport: vi.fn(async () => null),
    getStats: vi.fn(async () => ({})),
  };
});

import SettingsV2 from '../../components/v2/SettingsV2.svelte';
import { preferences } from '../stores/preferences';
import { dialogs } from '../stores/dialogs';
import de from '../locales/de';
import en from '../locales/en';
import es from '../locales/es';
import fr from '../locales/fr';
import hu from '../locales/hu';
import viLocale from '../locales/vi';
import elLocale from '../locales/el';
import it_ from '../locales/it';
import ja from '../locales/ja';
import ko from '../locales/ko';
import ro from '../locales/ro';
import sv from '../locales/sv';
import zh from '../locales/zh';

type Dict = Record<string, string>;
const FR = fr as unknown as Dict;

// Pour chaque langue : le mot du coffret composé à la main, celui de l'édition
// d'album, et celui de l'analyse complète, tels que le catalogue les emploie.
const MOTS: Record<string, { dict: Dict; coffret: string; edition: string; analyse: string }> = {
  fr: { dict: FR, coffret: 'coffrets composés à la main', edition: "éditions d'album", analyse: 'analyse complète' },
  en: { dict: en as unknown as Dict, coffret: 'hand-assembled box sets', edition: 'album edits', analyse: 'full scan' },
  de: { dict: de as unknown as Dict, coffret: 'von Hand zusammengestellte Box-Sets', edition: 'Albumbearbeitungen', analyse: 'vollständige Analyse' },
  es: { dict: es as unknown as Dict, coffret: 'cajas compuestas a mano', edition: 'ediciones de álbum', analyse: 'análisis completo' },
  it: { dict: it_ as unknown as Dict, coffret: 'cofanetti composti a mano', edition: 'modifiche agli album', analyse: 'scansione completa' },
  hu: { dict: hu as unknown as Dict, coffret: 'kézzel összeállított díszdobozok', edition: 'albumszerkesztés', analyse: 'teljes elemzés' },
  ja: { dict: ja as unknown as Dict, coffret: '手動で作成したボックスセット', edition: 'アルバムの編集内容', analyse: 'フル解析' },
  ko: { dict: ko as unknown as Dict, coffret: '직접 구성한 박스 세트', edition: '앨범 편집 내용', analyse: '전체 분석' },
  ro: { dict: ro as unknown as Dict, coffret: 'cutiile compuse manual', edition: 'editările de album', analyse: 'analiză completă' },
  sv: { dict: sv as unknown as Dict, coffret: 'boxar sammansatta för hand', edition: 'albumredigeringar', analyse: 'fullständig genomsökning' },
  vi: { dict: viLocale as unknown as Dict, coffret: 'bộ đĩa ghép thủ công', edition: 'chỉnh sửa album', analyse: 'quét đầy đủ' },
  el: { dict: elLocale as unknown as Dict, coffret: 'κασετίνες που συνθέσατε χειροκίνητα', edition: 'επεξεργασίες άλμπουμ', analyse: 'πλήρη σάρωση' },
  zh: { dict: zh as unknown as Dict, coffret: '手动组成的套装', edition: '专辑编辑', analyse: '完整扫描' },
};

class ResizeObserverInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

async function attendre(tours = 4) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function ecranBibliotheque(): Promise<HTMLElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(SettingsV2, { target: hote, props: {} });
  flushSync();
  await attendre();
  const onglet = [...hote.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === FR['settings.tabLibrary'],
  );
  expect(onglet, 'onglet Bibliothèque introuvable à l’écran').toBeDefined();
  (onglet as HTMLButtonElement).click();
  await attendre();
  return hote;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverInerte);
  preferences.update((p) => ({ ...p, settingsLevel: 'beginner' }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  vi.unstubAllGlobals();
});

describe('#2265 — l’écran dit que les coffrets et les éditions d’album seront perdus', () => {
  it('l’aide affichée sous le bouton les cite, avec la sauvegarde et l’analyse complète', async () => {
    const el = await ecranBibliotheque();
    const aide = FR['settings.clearLibraryV2Hint'];
    expect(el.textContent).toContain(aide);
    for (const mot of ['coffrets composés à la main', "éditions d'album", 'sauvegarde', 'analyse complète', 'conserve']) {
      expect(aide, `l’aide doit citer « ${mot} »`).toContain(mot);
    }
  });

  it('la confirmation réellement ouverte les cite, avec la sauvegarde et l’analyse complète', async () => {
    const el = await ecranBibliotheque();
    const bouton = [...el.querySelectorAll('button.danger')].find(
      (x) => (x.textContent ?? '').trim() === FR['settings.clearLibrary'],
    ) as HTMLButtonElement | undefined;
    expect(bouton, 'aucun bouton « Vider la bibliothèque »').toBeDefined();
    bouton!.click();
    await attendre();
    const file = get(dialogs);
    expect(file.length, 'aucune confirmation demandée').toBeGreaterThan(0);
    const message = file[file.length - 1].message;
    expect(message).toBe(FR['settings.clearLibraryConfirm']);
    for (const mot of ['PERDUS', 'coffrets composés à la main', "éditions d'album", 'sauvegarde', 'analyse complète', 'conserve']) {
      expect(message, `la confirmation doit citer « ${mot} »`).toContain(mot);
    }
  });
});

describe('#2265 — les douze langues portent la mise en garde', () => {
  for (const [langue, { dict, coffret, edition, analyse }] of Object.entries(MOTS)) {
    it(`${langue} : aide et confirmation citent coffrets, éditions et analyse complète`, () => {
      for (const cle of ['settings.clearLibraryV2Hint', 'settings.clearLibraryConfirm']) {
        const texte = dict[cle];
        expect(texte, `${langue} : ${cle} manquante`).toBeTruthy();
        expect(texte, `${langue} : ${cle} ne cite pas les coffrets composés à la main`).toContain(coffret);
        expect(texte, `${langue} : ${cle} ne cite pas les éditions d'album`).toContain(edition);
        expect(texte, `${langue} : ${cle} ne cite pas l'analyse complète`).toContain(analyse);
      }
    });
  }
});
