import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Lightbulb,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import type { Chapter, Clause, HighlightColor, LanguageCode, LawBook } from '../types/library';
import {
  buildClauseSharePayload,
  buildShareCaption,
  buildSocialPlatformLinks,
  generateClauseQuoteCardPng,
  HIGHLIGHT_ACCENT_HEX,
  QUOTE_CARD_THEMES,
  resolveCardThemeFromHighlight,
  type QuoteCardAspect,
  type QuoteCardThemeId,
} from '../utils/quoteShareCard';

interface ClauseShareModalProps {
  isOpen: boolean;
  book: LawBook;
  chapter: Chapter;
  clause: Clause | null;
  language: LanguageCode;
  highlightColor?: HighlightColor;
  initialQuoteExcerpt?: string;
  onClose: () => void;
}

const THEME_LIST = Object.values(QUOTE_CARD_THEMES);

export function ClauseShareModal({
  isOpen,
  book,
  chapter,
  clause,
  language,
  highlightColor,
  initialQuoteExcerpt = '',
  onClose,
}: ClauseShareModalProps) {
  const [themeId, setThemeId] = useState<QuoteCardThemeId>(() =>
    resolveCardThemeFromHighlight(highlightColor)
  );
  const [aspect, setAspect] = useState<QuoteCardAspect>('square');
  const [includeExplanation, setIncludeExplanation] = useState<boolean>(false);
  const [customQuote, setCustomQuote] = useState<string>(initialQuoteExcerpt);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [cardFilename, setCardFilename] = useState<string>('constitution-quote-card.png');
  const [cardError, setCardError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedCaption, setCopiedCaption] = useState<boolean>(false);

  // Reset modal controls cleanly whenever a new clause or highlight is opened
  useEffect(() => {
    if (!isOpen || !clause) return;
    setThemeId(resolveCardThemeFromHighlight(highlightColor));
    setCustomQuote(initialQuoteExcerpt);
    setIncludeExplanation(false);
    setStatusMessage(null);
    setCopiedCaption(false);
    setCardError(null);
  }, [isOpen, clause?.id, highlightColor, initialQuoteExcerpt]);

  const payload = useMemo(() => {
    if (!clause) return null;
    return buildClauseSharePayload({
      book,
      chapter,
      clause,
      language,
      highlightColor,
      customQuote,
      includeExplanation,
    });
  }, [book, chapter, clause, language, highlightColor, customQuote, includeExplanation]);

  const socialLinks = useMemo(
    () => (payload ? buildSocialPlatformLinks(payload) : []),
    [payload]
  );

  // Live-render high-resolution PNG quote card whenever content, theme, or aspect changes
  useEffect(() => {
    if (!isOpen || !payload) return;
    let cancelled = false;

    void generateClauseQuoteCardPng(payload, themeId, aspect)
      .then(({ blob, dataUrl, filename }) => {
        if (cancelled) return;
        setCardBlob(blob);
        setPreviewUrl(dataUrl);
        setCardFilename(filename);
        setCardError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setCardError(err instanceof Error ? err.message : 'Unable to generate quote card.');
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, payload, themeId, aspect]);

  if (!isOpen || !clause || !payload) return null;

  const highlightMeta = highlightColor ? HIGHLIGHT_ACCENT_HEX[highlightColor] : null;
  const captionText = buildShareCaption(payload);

  const triggerPngDownload = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = cardFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatusMessage(`Downloaded ${cardFilename}`);
  };

  const copyTextSafely = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below when Clipboard API is restricted in sandboxed iframes
    }
    try {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(helper);
      return copied;
    } catch {
      return false;
    }
  };

  const handleCopyCaption = async () => {
    const copied = await copyTextSafely(`${captionText}\n${payload.shareUrl}`);
    if (copied) {
      setCopiedCaption(true);
      setStatusMessage('Quote & citation copied to clipboard.');
      window.setTimeout(() => setCopiedCaption(false), 2000);
    } else {
      setStatusMessage('Select the quote text or use a social button below to share.');
    }
  };

  const handleNativeShareCard = async () => {
    if (!cardBlob) return;
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    try {
      if (nav && typeof nav.share === 'function') {
        const pngFile = new File([cardBlob], cardFilename, { type: 'image/png' });
        const canShareFiles =
          typeof nav.canShare === 'function' && nav.canShare({ files: [pngFile] });
        if (canShareFiles) {
          await nav.share({
            title: `${payload.bookTitle} · ${payload.clauseNumber}`,
            text: captionText,
            files: [pngFile],
          });
          setStatusMessage('Shared image card successfully.');
          return;
        }
        await nav.share({
          title: `${payload.bookTitle} · ${payload.clauseNumber}`,
          text: captionText,
          url: payload.shareUrl,
        });
        setStatusMessage('Shared quote link successfully.');
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }

    // Universal desktop/iframe fallback: download PNG image card + copy caption cleanly
    triggerPngDownload();
    const copied = await copyTextSafely(`${captionText}\n${payload.shareUrl}`);
    if (copied) {
      setStatusMessage('Saved PNG card & copied caption — ready to attach on any social platform.');
    } else {
      setStatusMessage('Saved PNG card — ready to upload to any social platform.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#090B10]/75 p-2 backdrop-blur-md sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-clause-modal-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#121620]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] dark:bg-blue-500/15 dark:text-blue-400">
              <Share2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="share-clause-modal-title"
                className="truncate font-display text-base font-bold text-slate-950 dark:text-white"
              >
                Share Quote Image Card
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {payload.bookShortTitle} · {payload.clauseNumber}
                {highlightMeta ? ` · ${highlightMeta.label}` : ''}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {/* Generated Image Card Preview */}
          <div className="flex flex-col items-center rounded-2xl border border-slate-200/80 bg-slate-100/80 p-3 dark:border-slate-800 dark:bg-[#0B0F17]">
            {cardError ? (
              <p className="py-12 text-xs font-medium text-rose-600 dark:text-rose-300">
                {cardError}
              </p>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt={`Generated quote card for ${payload.bookTitle} ${payload.clauseNumber}`}
                data-quote-card-preview="ready"
                className={`rounded-2xl shadow-lg ring-1 ring-black/10 ${
                  aspect === 'portrait' ? 'max-h-[340px] w-auto' : 'max-h-[300px] w-auto'
                }`}
              />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-slate-200/70 text-slate-400 dark:bg-slate-800">
                <ImageIcon className="h-8 w-8 animate-pulse" />
              </div>
            )}
          </div>

          {/* Card Customization Row: Theme, Aspect Ratio, Deep Explanation Toggle */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Card Style
              </p>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {THEME_LIST.map((theme) => {
                  const active = theme.id === themeId;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeId(theme.id)}
                      aria-label={`Select ${theme.label} theme`}
                      aria-pressed={active}
                      className={`flex flex-col items-center gap-1 rounded-xl border p-1.5 transition cursor-pointer ${
                        active
                          ? 'border-[#2563EB] bg-blue-50/70 dark:border-blue-400 dark:bg-blue-500/15'
                          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0D111A]'
                      }`}
                    >
                      <span
                        className={`h-6 w-full rounded-lg bg-gradient-to-br ${theme.swatchClass} ring-1 ring-black/10`}
                      />
                      <span className="truncate text-[10px] font-bold text-slate-700 dark:text-slate-200">
                        {theme.id === 'indigo'
                          ? 'Indigo'
                          : theme.id === 'parchment'
                            ? 'Parchment'
                            : theme.id === 'obsidian'
                              ? 'Obsidian'
                              : 'Ivory'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Card Format & Details
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAspect('square')}
                  aria-pressed={aspect === 'square'}
                  className={`h-9 flex-1 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                    aspect === 'square'
                      ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                  }`}
                >
                  Square 1:1
                </button>
                <button
                  type="button"
                  onClick={() => setAspect('portrait')}
                  aria-pressed={aspect === 'portrait'}
                  className={`h-9 flex-1 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                    aspect === 'portrait'
                      ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                  }`}
                >
                  Portrait 4:5
                </button>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includeExplanation}
                onClick={() => setIncludeExplanation((prev) => !prev)}
                className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition cursor-pointer ${
                  includeExplanation
                    ? 'border-amber-500/50 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200'
                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-300'
                }`}
              >
                <Lightbulb className="h-3.5 w-3.5" />
                <span>
                  {includeExplanation ? 'Deep Explanation Included' : 'Include Deep Explanation'}
                </span>
              </button>
            </div>
          </div>

          {/* Optional Custom Highlighted Quote Excerpt */}
          <div>
            <label
              htmlFor="custom-quote-excerpt"
              className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400"
            >
              <span className="min-w-0">Highlighted Quote Excerpt (Editable)</span>
              {customQuote.trim() && (
                <button
                  type="button"
                  onClick={() => setCustomQuote('')}
                  className="shrink-0 whitespace-nowrap text-[11px] font-semibold normal-case tracking-normal text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                >
                  Reset full clause
                </button>
              )}
            </label>
            <textarea
              id="custom-quote-excerpt"
              rows={2}
              value={customQuote}
              onChange={(e) => setCustomQuote(e.target.value)}
              placeholder={payload.quoteText}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-900 outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
            />
          </div>

          {/* Primary Image Card Share & Download Actions */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => void handleNativeShareCard()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>Share Image Card</span>
            </button>
            <button
              type="button"
              onClick={triggerPngDownload}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-800 transition hover:border-blue-400 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-100 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Download PNG</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopyCaption()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-800 transition hover:border-blue-400 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-100 cursor-pointer"
            >
              {copiedCaption ? (
                <>
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Copied Quote</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copy Quote</span>
                </>
              )}
            </button>
          </div>

          {statusMessage && (
            <p
              role="status"
              className="rounded-xl bg-emerald-500/12 px-3 py-2 text-center text-xs font-semibold text-emerald-800 dark:text-emerald-200"
            >
              {statusMessage}
            </p>
          )}

          {/* External Social Platforms */}
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Share to Social Platforms
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {socialLinks.map((platform) => (
                <a
                  key={platform.id}
                  href={platform.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Share quote to ${platform.label}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 transition hover:border-blue-500 hover:bg-blue-50/70 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-100 dark:hover:border-blue-400"
                >
                  <span className="truncate">{platform.label}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
