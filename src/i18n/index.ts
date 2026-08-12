import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Minimal i18n — English keys, Hindi dictionary, graceful fallback.
 *
 * Keys ARE the English strings, so untranslated text simply renders in
 * English instead of as a broken token; adding a language = adding one
 * dictionary. Coverage today: the main chrome (Home, editor toolbar, left
 * panel, page headers). Inspector internals and error copy remain English —
 * extend HI as those surfaces stabilise.
 */

export type Lang = 'en' | 'hi';

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
];

const HI: Record<string, string> = {
  // Home chrome
  'Projects': 'प्रोजेक्ट्स',
  'All projects': 'सभी प्रोजेक्ट्स',
  'Recent': 'हाल के',
  'Templates': 'टेम्पलेट्स',
  'Trash': 'ट्रैश',
  'Library': 'लाइब्रेरी',
  'New project': 'नया प्रोजेक्ट',
  'Import': 'इम्पोर्ट',
  'Search projects, rooms, materials…': 'प्रोजेक्ट, कमरे, मटीरियल खोजें…',
  'Local storage': 'लोकल स्टोरेज',
  'Get started': 'शुरू करें',
  'Upload & trace a plan': 'प्लान अपलोड करें और ट्रेस करें',
  'PDF, PNG or JPG': 'PDF, PNG या JPG',
  'Local-first · nothing leaves this machine': 'लोकल-फ़र्स्ट · कुछ भी इस मशीन से बाहर नहीं जाता',

  // Editor toolbar
  'Undo': 'अन्डू',
  'Redo': 'रीडू',
  'Orbit': 'ऑर्बिट',
  'Top': 'ऊपर से',
  'Walk': 'वॉक',
  'Tour': 'टूर',
  'Photo': 'फ़ोटो',
  'Photoreal': 'फ़ोटोरियल',
  'Cycles': 'Cycles',
  'Render all': 'सब रेंडर करें',
  'Rendering…': 'रेंडर हो रहा है…',
  'Before/After': 'पहले/बाद',
  'Before': 'पहले',
  'Slider': 'स्लाइडर',
  'Save': 'सेव',
  'Saving…': 'सेव हो रहा है…',
  'Share': 'शेयर',
  'Export': 'एक्सपोर्ट',
  'Variants…': 'वेरिएंट्स…',

  // Left panel + page headers
  'Rooms': 'कमरे',
  'Style packs': 'स्टाइल पैक',
  'Room': 'कमरा',
  'Whole home': 'पूरा घर',
  'Trace plan': 'प्लान ट्रेस करें',
  'Boards': 'बोर्ड्स',
  'Export PDF': 'PDF एक्सपोर्ट करें',
  'Export BOQ': 'BOQ एक्सपोर्ट करें',
  'Brand': 'ब्रांड',
  'Language': 'भाषा',
};

const DICTS: Record<Lang, Record<string, string>> = { en: {}, hi: HI };

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLang = create<LangState>()(
  persist((set) => ({ lang: 'en', setLang: (lang) => set({ lang }) }), { name: 'hc-lang' }),
);

/** Translate hook: `const t = useT(); t('Projects')`. Falls back to the key. */
export function useT(): (key: string) => string {
  const lang = useLang((s) => s.lang);
  const dict = DICTS[lang];
  return (key: string) => dict[key] ?? key;
}
