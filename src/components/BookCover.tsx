import { Headphones } from 'lucide-react';
import type { LawBook } from '../types/library';

interface BookCoverProps {
  book: LawBook;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TONE_STYLES: Record<LawBook['coverTone'], string> = {
  cobalt: 'from-[#0F1E4A] via-[#1D4ED8] to-[#2563EB]',
  sapphire: 'from-[#0C1938] via-[#1E3A8A] to-[#0284C7]',
  slate: 'from-[#111827] via-[#1F2937] to-[#334155]',
  emerald: 'from-[#06281E] via-[#065F46] to-[#0D9488]',
  amber: 'from-[#3B1D0A] via-[#92400E] to-[#D97706]',
  obsidian: 'from-[#090B10] via-[#181E2E] to-[#28334D]',
};

const SIZE_CLASSES: Record<NonNullable<BookCoverProps['size']>, string> = {
  sm: 'h-20 w-15 rounded-xl',
  md: 'h-32 w-24 rounded-2xl',
  lg: 'h-48 w-36 rounded-[22px]',
};

function getYearBadge(year: string): string {
  const match = year.match(/\d{4}/);
  return match ? match[0] : 'LAW';
}

export function BookCover({ book, size = 'md', className = '' }: BookCoverProps) {
  const sizeClass = SIZE_CLASSES[size];

  if (book.coverImage) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden bg-slate-900 shadow-lg ring-1 ring-black/10 dark:ring-white/15 ${sizeClass} ${className}`}
      >
        <img
          src={book.coverImage}
          alt={book.shortTitle}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090B10]/85 via-[#090B10]/15 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 text-white">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-blue-200">
              {getYearBadge(book.year)}
            </span>
            <Headphones className="h-3 w-3 text-amber-300" aria-hidden="true" />
          </div>
          {size !== 'sm' && (
            <p className="mt-0.5 line-clamp-2 font-display text-xs font-bold leading-tight text-white">
              {book.shortTitle}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br p-3 text-white shadow-lg ring-1 ring-black/10 dark:ring-white/15 ${TONE_STYLES[book.coverTone]} ${sizeClass} ${className}`}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/15 blur-xl" />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white/80">
          {getYearBadge(book.year)}
        </span>
        <Headphones className="h-3 w-3 text-amber-300" aria-hidden="true" />
      </div>
      <div>
        <p className="line-clamp-3 font-display text-xs font-bold leading-snug text-white">
          {book.shortTitle}
        </p>
        {size === 'lg' && (
          <p className="mt-1 truncate text-[10px] text-white/75">{book.jurisdiction}</p>
        )}
      </div>
    </div>
  );
}
