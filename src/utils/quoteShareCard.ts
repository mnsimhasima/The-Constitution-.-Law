import type { Chapter, Clause, HighlightColor, LanguageCode, LawBook } from '../types/library';
import { getLocalizedText, isRtlLanguage, localizeStructuralLabel } from './libraryLogic';

export type QuoteCardThemeId = 'indigo' | 'parchment' | 'obsidian' | 'ivory';
export type QuoteCardAspect = 'square' | 'portrait';

export interface QuoteCardThemePalette {
  id: QuoteCardThemeId;
  label: string;
  bgStart: string;
  bgEnd: string;
  accent: string;
  accentSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  swatchClass: string;
}

export const QUOTE_CARD_THEMES: Record<QuoteCardThemeId, QuoteCardThemePalette> = {
  indigo: {
    id: 'indigo',
    label: 'Constitutional Indigo',
    bgStart: '#0B1637',
    bgEnd: '#1D4ED8',
    accent: '#F59E0B',
    accentSoft: 'rgba(245, 158, 11, 0.16)',
    textPrimary: '#FFFFFF',
    textSecondary: '#DBEAFE',
    textMuted: '#93C5FD',
    border: 'rgba(255, 255, 255, 0.16)',
    swatchClass: 'from-[#0B1637] to-[#1D4ED8]',
  },
  parchment: {
    id: 'parchment',
    label: 'Archival Parchment',
    bgStart: '#FBF7EE',
    bgEnd: '#EFE4CC',
    accent: '#B45309',
    accentSoft: 'rgba(180, 83, 9, 0.12)',
    textPrimary: '#1C160F',
    textSecondary: '#473927',
    textMuted: '#786246',
    border: 'rgba(120, 98, 70, 0.22)',
    swatchClass: 'from-[#FBF7EE] to-[#E6D6B5]',
  },
  obsidian: {
    id: 'obsidian',
    label: 'Obsidian Slate',
    bgStart: '#0C1018',
    bgEnd: '#171E2E',
    accent: '#38BDF8',
    accentSoft: 'rgba(56, 189, 248, 0.14)',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    textMuted: '#94A3B8',
    border: 'rgba(148, 163, 184, 0.22)',
    swatchClass: 'from-[#0C1018] to-[#1E293B]',
  },
  ivory: {
    id: 'ivory',
    label: 'Editorial Ivory',
    bgStart: '#FFFFFF',
    bgEnd: '#F1F5F9',
    accent: '#2563EB',
    accentSoft: 'rgba(37, 99, 235, 0.10)',
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    textMuted: '#64748B',
    border: 'rgba(15, 23, 42, 0.12)',
    swatchClass: 'from-[#FFFFFF] to-[#E2E8F0]',
  },
};

export const HIGHLIGHT_ACCENT_HEX: Record<HighlightColor, { hex: string; label: string }> = {
  sky: { hex: '#3B82F6', label: 'Cobalt Highlight' },
  amber: { hex: '#F59E0B', label: 'Amber Highlight' },
  sage: { hex: '#10B981', label: 'Mint Highlight' },
  rose: { hex: '#F43F5E', label: 'Coral Highlight' },
  lilac: { hex: '#8B5CF6', label: 'Iris Highlight' },
};

export function resolveCardThemeFromHighlight(color?: HighlightColor): QuoteCardThemeId {
  if (color === 'amber') return 'parchment';
  if (color === 'sky') return 'indigo';
  if (color === 'sage' || color === 'lilac') return 'obsidian';
  if (color === 'rose') return 'ivory';
  return 'indigo';
}

export interface ClauseSharePayload {
  bookTitle: string;
  bookShortTitle: string;
  chapterNumber: string;
  chapterTitle: string;
  clauseNumber: string;
  principle: string;
  quoteText: string;
  explanationText: string;
  language: LanguageCode;
  highlightColor?: HighlightColor;
  includeExplanation: boolean;
  shareUrl: string;
}

export function buildClauseSharePayload(params: {
  book: LawBook;
  chapter: Chapter;
  clause: Clause;
  language: LanguageCode;
  highlightColor?: HighlightColor;
  customQuote?: string;
  includeExplanation?: boolean;
  originUrl?: string;
}): ClauseSharePayload {
  const { book, chapter, clause, language, highlightColor, customQuote } = params;
  const bookTitle = getLocalizedText(book.title, language) || book.shortTitle;
  const chapterNumber = localizeStructuralLabel(chapter.number, language);
  const chapterTitle = getLocalizedText(chapter.title, language);
  const clauseNumber = localizeStructuralLabel(clause.number, language);
  const principle = getLocalizedText(clause.principle, language);
  const baseQuote = getLocalizedText(clause.text, language).trim();
  const quoteText = customQuote?.trim() ? customQuote.trim() : baseQuote;
  const explanationText = getLocalizedText(clause.explanation, language).trim();
  const baseOrigin =
    params.originUrl ??
    (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'https://constitutionandlaw.app');

  const urlObj = new URL(baseOrigin.startsWith('http') ? baseOrigin : 'https://constitutionandlaw.app');
  urlObj.searchParams.set('book', book.id);
  urlObj.searchParams.set('chapter', chapter.id);
  urlObj.searchParams.set('clause', clause.id);
  urlObj.searchParams.set('lang', language);

  return {
    bookTitle,
    bookShortTitle: book.shortTitle,
    chapterNumber,
    chapterTitle,
    clauseNumber,
    principle,
    quoteText,
    explanationText,
    language,
    highlightColor,
    includeExplanation: Boolean(params.includeExplanation),
    shareUrl: urlObj.toString(),
  };
}

/**
 * Formats a clean social caption with quote, optional explanation, and constitutional citation.
 */
export function buildShareCaption(payload: ClauseSharePayload, maxLength = 420): string {
  const citation = `— ${payload.bookTitle} (${payload.clauseNumber}: ${payload.principle})`;
  const footer = '#ConstitutionAndLaw';
  const rawQuote = payload.quoteText.replace(/\s+/g, ' ').trim();
  const extra =
    payload.includeExplanation && payload.explanationText
      ? `\n\nInsight: ${payload.explanationText.replace(/\s+/g, ' ').trim()}`
      : '';

  const full = `“${rawQuote}”${extra}\n\n${citation}\n${footer}`;
  if (full.length <= maxLength) {
    return full;
  }

  const fixedOverhead = citation.length + footer.length + 10;
  const availableQuoteChars = Math.max(60, maxLength - fixedOverhead);
  const truncatedQuote =
    rawQuote.length > availableQuoteChars
      ? `${rawQuote.slice(0, availableQuoteChars - 1).trimEnd()}…`
      : rawQuote;
  return `“${truncatedQuote}”\n\n${citation}\n${footer}`;
}

export interface SocialPlatformLink {
  id: 'x' | 'whatsapp' | 'linkedin' | 'facebook' | 'telegram';
  label: string;
  href: string;
}

/**
 * Builds semantic external social share intent URLs (rendered via <a target="_blank"> — never window.open).
 */
export function buildSocialPlatformLinks(payload: ClauseSharePayload): SocialPlatformLink[] {
  const shortCaption = buildShareCaption(payload, 240);
  const fullCaption = buildShareCaption(payload, 460);
  const encodedUrl = encodeURIComponent(payload.shareUrl);
  const encodedShortText = encodeURIComponent(shortCaption);
  const encodedFullWithUrl = encodeURIComponent(`${fullCaption}\n${payload.shareUrl}`);

  return [
    {
      id: 'x',
      label: 'X / Twitter',
      href: `https://twitter.com/intent/tweet?text=${encodedShortText}&url=${encodedUrl}`,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      href: `https://api.whatsapp.com/send?text=${encodedFullWithUrl}`,
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      id: 'facebook',
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedShortText}`,
    },
    {
      id: 'telegram',
      label: 'Telegram',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedShortText}`,
    },
  ];
}

/**
 * Pure line-wrapping helper for HTML5 Canvas text measurement (works with Latin, Telugu, Hindi, Arabic).
 */
export function wrapCanvasTextLines(
  text: string,
  maxWidth: number,
  measureWidth: (candidate: string) => number,
  maxLines: number
): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (measureWidth(candidate) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        // Gather remaining text into the final line and ellipsize if needed
        let tail = [current, ...words.slice(i + 1)].join(' ');
        if (measureWidth(tail) > maxWidth) {
          while (tail.length > 4 && measureWidth(`${tail}…`) > maxWidth) {
            tail = tail.slice(0, -1).trimEnd();
          }
          tail = `${tail}…`;
        }
        lines.push(tail);
        return lines;
      }
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines.slice(0, maxLines);
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function buildQuoteCardFilename(payload: ClauseSharePayload): string {
  const slug = `${payload.bookShortTitle}-${payload.clauseNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${slug || 'constitution-quote'}-card.png`;
}

/**
 * Renders a high-resolution (1080×1080 or 1080×1350) editorial PNG quote card on an HTML5 Canvas.
 */
export function renderClauseQuoteCardCanvas(
  payload: ClauseSharePayload,
  themeId: QuoteCardThemeId,
  aspect: QuoteCardAspect
): HTMLCanvasElement {
  const width = 1080;
  const height = aspect === 'portrait' ? 1350 : 1080;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to initialize canvas context for quote card.');
  }

  const palette = QUOTE_CARD_THEMES[themeId] ?? QUOTE_CARD_THEMES.indigo;
  const highlightAccent = payload.highlightColor
    ? HIGHLIGHT_ACCENT_HEX[payload.highlightColor]
    : null;
  const activeAccent = highlightAccent?.hex ?? palette.accent;
  const rtl = isRtlLanguage(payload.language);

  // 1. Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, palette.bgStart);
  grad.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle architectural radial glow & archival inner border
  const glow = ctx.createRadialGradient(width * 0.85, height * 0.14, 20, width * 0.85, height * 0.14, 480);
  glow.addColorStop(0, palette.accentSoft);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const frameInset = 44;
  drawRoundedRectPath(
    ctx,
    frameInset,
    frameInset,
    width - frameInset * 2,
    height - frameInset * 2,
    36
  );
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Top accent bar reflecting highlight color or theme accent
  drawRoundedRectPath(ctx, frameInset + 40, frameInset + 36, 112, 8, 4);
  ctx.fillStyle = activeAccent;
  ctx.fill();

  const padX = 96;
  const contentWidth = width - padX * 2;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  const anchorX = rtl ? width - padX : padX;

  // 3. Top Archival Eyebrow (Book Title · Clause Number)
  ctx.font = '700 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = activeAccent;
  const eyebrow = `${payload.bookTitle.toUpperCase()}  ·  ${payload.clauseNumber.toUpperCase()}`;
  const eyebrowLines = wrapCanvasTextLines(eyebrow, contentWidth, (s) => ctx.measureText(s).width, 2);
  let cursorY = frameInset + 92;
  for (const line of eyebrowLines) {
    ctx.fillText(line, anchorX, cursorY);
    cursorY += 34;
  }

  // Optional Highlight Pill Tag if the clause is highlighted
  if (highlightAccent) {
    cursorY += 6;
    ctx.font = '700 20px system-ui, -apple-system, sans-serif';
    const tagText = `★ ${highlightAccent.label.toUpperCase()}`;
    const tagWidth = ctx.measureText(tagText).width + 34;
    const tagX = rtl ? anchorX - tagWidth : anchorX;
    drawRoundedRectPath(ctx, tagX, cursorY - 22, tagWidth, 36, 10);
    ctx.fillStyle = palette.accentSoft;
    ctx.fill();
    ctx.strokeStyle = activeAccent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = palette.textPrimary;
    ctx.fillText(tagText, rtl ? anchorX - 17 : anchorX + 17, cursorY + 3);
    cursorY += 42;
  }

  // 4. Principle / Clause Headline
  cursorY += 20;
  ctx.font = '800 36px Georgia, "Times New Roman", serif';
  ctx.fillStyle = palette.textPrimary;
  const headlineLines = wrapCanvasTextLines(
    payload.principle,
    contentWidth,
    (s) => ctx.measureText(s).width,
    2
  );
  for (const line of headlineLines) {
    ctx.fillText(line, anchorX, cursorY);
    cursorY += 46;
  }

  // 5. Large Opening Quotation Glyph + Highlighted Quote Body
  cursorY += 22;
  const quoteBarTop = cursorY - 26;
  const quoteFontSize =
    payload.quoteText.length > 260 ? 34 : payload.quoteText.length > 160 ? 40 : 46;
  const quoteLineHeight = Math.round(quoteFontSize * 1.44);
  ctx.font = `600 ${quoteFontSize}px system-ui, -apple-system, "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif`;
  const quoteMaxLines = payload.includeExplanation
    ? aspect === 'portrait'
      ? 8
      : 6
    : aspect === 'portrait'
      ? 12
      : 9;
  const quoteIndent = 30;
  const quoteLines = wrapCanvasTextLines(
    `“${payload.quoteText}”`,
    contentWidth - quoteIndent,
    (s) => ctx.measureText(s).width,
    quoteMaxLines
  );

  // Vertical highlight accent bar alongside the quote
  const quoteBlockHeight = Math.max(quoteLineHeight, quoteLines.length * quoteLineHeight);
  const barX = rtl ? width - padX - 8 : padX;
  drawRoundedRectPath(ctx, barX, quoteBarTop, 8, quoteBlockHeight + 8, 4);
  ctx.fillStyle = activeAccent;
  ctx.fill();

  ctx.fillStyle = palette.textPrimary;
  const quoteTextX = rtl ? anchorX - quoteIndent : anchorX + quoteIndent;
  for (const line of quoteLines) {
    ctx.fillText(line, quoteTextX, cursorY + 12);
    cursorY += quoteLineHeight;
  }

  // 6. Optional Deep Explanation Box
  if (payload.includeExplanation && payload.explanationText) {
    cursorY += 28;
    ctx.font = '500 25px system-ui, -apple-system, "Noto Sans Telugu", sans-serif';
    const expLines = wrapCanvasTextLines(
      payload.explanationText,
      contentWidth - 52,
      (s) => ctx.measureText(s).width,
      aspect === 'portrait' ? 5 : 3
    );
    const boxHeight = 58 + expLines.length * 36;
    const maxFooterTop = height - frameInset - 145;

    if (cursorY + boxHeight < maxFooterTop) {
      drawRoundedRectPath(ctx, padX, cursorY, contentWidth, boxHeight, 20);
      ctx.fillStyle = palette.accentSoft;
      ctx.fill();
      ctx.strokeStyle = palette.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = activeAccent;
      ctx.fillText(
        payload.language === 'te' ? 'లోతైన వివరణ' : 'DEEP EXPLANATION',
        rtl ? width - padX - 26 : padX + 26,
        cursorY + 34
      );

      ctx.font = '500 24px system-ui, -apple-system, "Noto Sans Telugu", sans-serif';
      ctx.fillStyle = palette.textSecondary;
      let expY = cursorY + 70;
      for (const line of expLines) {
        ctx.fillText(line, rtl ? width - padX - 26 : padX + 26, expY);
        expY += 35;
      }
    }
  }

  // 7. Footer Rule + Attribution + Brand Mark
  const footerY = height - frameInset - 92;
  ctx.beginPath();
  ctx.moveTo(padX, footerY - 30);
  ctx.lineTo(width - padX, footerY - 30);
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.font = '700 26px Georgia, "Times New Roman", serif';
  ctx.fillStyle = palette.textPrimary;
  ctx.fillText('The Constitution & Law', padX, footerY + 12);

  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = palette.textMuted;
  const subFooter = `${payload.chapterNumber} · ${payload.chapterTitle}`;
  const trimmedSub =
    subFooter.length > 52 ? `${subFooter.slice(0, 51).trimEnd()}…` : subFooter;
  ctx.fillText(trimmedSub, padX, footerY + 46);

  ctx.textAlign = 'right';
  ctx.font = '700 20px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = activeAccent;
  ctx.fillText(payload.language.toUpperCase() + ' EDITION', width - padX, footerY + 26);

  return canvas;
}

export async function generateClauseQuoteCardPng(
  payload: ClauseSharePayload,
  themeId: QuoteCardThemeId,
  aspect: QuoteCardAspect
): Promise<{ blob: Blob; dataUrl: string; filename: string }> {
  const canvas = renderClauseQuoteCardCanvas(payload, themeId, aspect);
  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Failed to export quote card PNG.'));
      }
    }, 'image/png');
  });

  return {
    blob,
    dataUrl,
    filename: buildQuoteCardFilename(payload),
  };
}
