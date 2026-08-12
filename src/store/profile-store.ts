import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Designer/studio identity, persisted to localStorage so it survives reloads
 * and carries across every project. Used to brand exported boards (PDF cover)
 * and the client-facing 3D viewer link (?brand=<studioName>). Deliberately
 * tiny and independent of the editor/project stores — it's read from pages
 * that have no scene loaded (HomePage) as well as ones that do (Boards, the
 * canvas toolbar).
 */
interface ProfileState {
  studioName: string;
  contact: string;
  /** Data URL (≤200KB, enforced by ProfileDialog) or null when no logo is set. */
  logoDataUrl: string | null;
  setStudioName: (v: string) => void;
  setContact: (v: string) => void;
  setLogoDataUrl: (v: string | null) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      studioName: '',
      contact: '',
      logoDataUrl: null,
      setStudioName: (studioName) => set({ studioName }),
      setContact: (contact) => set({ contact }),
      setLogoDataUrl: (logoDataUrl) => set({ logoDataUrl }),
    }),
    { name: 'hc-profile' },
  ),
);
