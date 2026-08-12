import { useEffect, useRef, useState } from 'react';
import { useProfile } from '../../store/profile-store';
import { Button } from './Button';
import { Icon } from './Icon';
import { FOCUS_RING } from './primitives';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_LOGO_BYTES = 200 * 1024;

/**
 * Designer profile editor — studio name, contact, and a small logo — used to
 * brand exported boards/PDFs and the client viewer link. Visual pattern
 * mirrors ConfirmDialog/CreateProjectDialog (bg-panel rounded-2xl hc-card +
 * backdrop). Reads/writes the persisted profile store directly.
 */
export function ProfileDialog({ open, onClose }: Props) {
  const studioName = useProfile((s) => s.studioName);
  const contact = useProfile((s) => s.contact);
  const logoDataUrl = useProfile((s) => s.logoDataUrl);
  const setStudioName = useProfile((s) => s.setStudioName);
  const setContact = useProfile((s) => s.setContact);
  const setLogoDataUrl = useProfile((s) => s.setLogoDataUrl);

  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setLogoError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onPickLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`That logo is ${Math.round(file.size / 1024)} KB — keep it under 200 KB.`);
      return;
    }
    setLogoError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setLogoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-ink/10 p-4 backdrop-blur-[2px] print:hidden"
      onPointerDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Designer profile"
        className="hc-card w-full max-w-sm rounded-2xl border border-line bg-panel p-6"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Designer profile</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] text-dim transition hover:bg-soft hover:text-ink ${FOCUS_RING}`}
          >
            <Icon name="close" className="text-[15px]" />
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-dim">Shown on branded boards, exported PDFs, and the client viewer link.</p>

        <label className="mt-4 block text-[12.5px] font-semibold text-dim">
          Studio name
          <input
            type="text"
            value={studioName}
            onChange={(e) => setStudioName(e.target.value)}
            placeholder="e.g. Atelier North"
            className={`mt-1.5 w-full rounded-[10px] border border-line bg-field px-3 py-2 text-[14px] text-ink outline-none placeholder:text-faint focus:border-accent/50 ${FOCUS_RING}`}
          />
        </label>

        <label className="mt-3.5 block text-[12.5px] font-semibold text-dim">
          Contact
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="you@studio.com · +1 555 0100"
            className={`mt-1.5 w-full rounded-[10px] border border-line bg-field px-3 py-2 text-[14px] text-ink outline-none placeholder:text-faint focus:border-accent/50 ${FOCUS_RING}`}
          />
        </label>

        <div className="mt-3.5">
          <span className="block text-[12.5px] font-semibold text-dim">Logo</span>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-soft">
              {logoDataUrl ? (
                <img src={logoDataUrl} alt="Logo preview" className="h-full w-full object-contain" />
              ) : (
                <Icon name="image" className="text-[18px] text-faint" />
              )}
            </span>
            <div className="flex flex-col items-start gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                {logoDataUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
              {logoDataUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setLogoDataUrl(null);
                    setLogoError(null);
                  }}
                  className={`text-[12px] font-semibold text-dim transition hover:text-ink ${FOCUS_RING}`}
                >
                  Remove logo
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                onPickLogo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {logoError ? (
            <p className="mt-2 rounded-[8px] bg-[#fbf0e3] px-2.5 py-1.5 text-[12px] text-[#9a5a1e]">{logoError}</p>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-faint">PNG or JPG, under 200 KB.</p>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
