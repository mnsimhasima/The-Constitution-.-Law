import type { User } from 'firebase/auth';
import { Check, Copy, QrCode, Share2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ProfileQrModalProps {
  isOpen: boolean;
  user: User | null;
  streakDays: number;
  friendsCount: number;
  onClose: () => void;
}

/** Deterministic 21x21 QR-style matrix with 3 authentic finder squares for profile sharing */
function buildProfileQrCells(seed: string): boolean[][] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = isBorder || isCenter;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inFinder =
        (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);
      if (inFinder) continue;
      hash = Math.imul(hash ^ (r * 31 + c * 17), 16777619);
      grid[r][c] = (hash >>> 28) % 2 === 0;
    }
  }

  return grid;
}

export function ProfileQrModal({
  isOpen,
  user,
  streakDays,
  friendsCount,
  onClose,
}: ProfileQrModalProps) {
  const [copied, setCopied] = useState(false);

  const displayName = user?.displayName ?? 'Civic Scholar';
  const handle = user?.email
    ? `@${user.email.split('@')[0].replace(/[^a-zA-Z0-9._]/g, '').slice(0, 18)}`
    : '@civic.scholar';
  const shareUrl = `https://constitution-law.app/u/${handle.replace(/^@/, '')}`;

  const qrCells = useMemo(() => buildProfileQrCells(shareUrl), [shareUrl]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090B10]/70 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-qr-title"
        className="w-full max-w-sm overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#121620]"
      >
        <div className="relative bg-gradient-to-br from-[#0F1E4A] via-[#172554] to-[#2563EB] px-6 py-5 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile QR"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200">
            <QrCode className="h-3.5 w-3.5" />
            <span>Profile QR Pass</span>
          </div>
          <h2 id="profile-qr-title" className="mt-1 font-display text-xl font-bold">
            {displayName}
          </h2>
          <p className="font-mono text-xs text-blue-100/90">
            {handle} · {streakDays}d streak · {friendsCount} friends
          </p>
        </div>

        <div className="space-y-4 p-6 text-center">
          <div className="mx-auto inline-flex rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700">
            <svg
              viewBox="0 0 21 21"
              className="h-48 w-48"
              role="img"
              aria-label={`QR code for ${displayName}`}
            >
              <rect width="21" height="21" fill="#FFFFFF" />
              {qrCells.map((row, r) =>
                row.map((filled, c) =>
                  filled ? (
                    <rect
                      key={`${r}-${c}`}
                      x={c}
                      y={r}
                      width="1"
                      height="1"
                      rx="0.16"
                      fill="#0C1018"
                    />
                  ) : null
                )
              )}
            </svg>
          </div>

          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Friends can scan this QR pass to connect with you, follow your reading tracks, and share constitutional notes.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Profile Link Copied' : 'Copy Profile Link'}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              aria-label="Share QR pass"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
