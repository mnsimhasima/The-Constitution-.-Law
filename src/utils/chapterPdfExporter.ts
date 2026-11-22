import { jsPDF } from 'jspdf';
import type {
  Chapter,
  ClauseNote,
  LanguageCode,
  LawBook,
} from '../types/library';
import {
  getClauseKey,
  getLocalizedText,
  localizeStructuralLabel,
} from './libraryLogic';

export type ExportPaperSize = 'a4' | 'letter';

export interface ChapterExportOptions {
  paperSize: ExportPaperSize;
  includeExplanations: boolean;
  includeRealWorldExamples: boolean;
  includeParallelLanguage: boolean;
  compareLanguage?: LanguageCode;
  includeStudyNotes: boolean;
}

export interface ChapterExportClauseItem {
  id: string;
  numberLabel: string;
  principle: string;
  legalText: string;
  parallelLanguageName?: string;
  parallelText?: string;
  explanation?: string;
  realWorldExample?: string;
  studyNotes: string[];
}

export interface ChapterExportDocument {
  filename: string;
  bookTitle: string;
  bookShortTitle: string;
  jurisdiction: string;
  year: string;
  chapterNumberLabel: string;
  chapterTitle: string;
  chapterSummary: string;
  languageCode: LanguageCode;
  languageName: string;
  generatedAtIso: string;
  generatedAtDisplay: string;
  paperSize: ExportPaperSize;
  clauses: ChapterExportClauseItem[];
  wordCount: number;
  estimatedPages: number;
  containsNonLatinScript: boolean;
}

export interface PaginatedExportBlock {
  kind: 'heading' | 'body' | 'callout';
  lines: string[];
}

/**
 * Returns true if any text contains non-Latin characters (Telugu, Hindi, Arabic, etc.)
 * that require native browser font shaping rather than jsPDF built-in Type1 Helvetica.
 */
export function containsNonLatinText(text: string): boolean {
  return /[^\u0000-\u024F\u2000-\u206F]/.test(text);
}

/**
 * Generates a clean, filesystem-safe PDF filename for the exported chapter.
 */
export function sanitizeExportFilename(
  bookTitle: string,
  chapterNumber: string,
  languageCode: LanguageCode
): string {
  const slugify = (raw: string) =>
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

  const bookSlug = slugify(bookTitle) || 'legal-chapter';
  const chSlug = slugify(chapterNumber) || 'chapter';
  return `${bookSlug}-${chSlug}-${languageCode}.pdf`;
}

/**
 * Pure deterministic builder that assembles all formatted legal content for PDF export or printing.
 */
export function buildChapterExportDocument(params: {
  book: LawBook;
  chapter: Chapter;
  language: LanguageCode;
  languageName: string;
  compareLanguageName?: string;
  notes?: ClauseNote[];
  options: ChapterExportOptions;
  now?: Date;
}): ChapterExportDocument {
  const { book, chapter, language, languageName, compareLanguageName, notes = [], options } = params;
  const now = params.now ?? new Date();

  const bookTitle = getLocalizedText(book.title, language);
  const chapterNumberLabel = localizeStructuralLabel(chapter.number, language);
  const chapterTitle = getLocalizedText(chapter.title, language);
  const chapterSummary = getLocalizedText(chapter.summary, language);

  const compareLang =
    options.includeParallelLanguage && options.compareLanguage && options.compareLanguage !== language
      ? options.compareLanguage
      : undefined;

  const clauses: ChapterExportClauseItem[] = chapter.clauses.map((clause) => {
    const clauseKey = getClauseKey(book.id, chapter.id, clause.id);
    const clauseNotes = options.includeStudyNotes
      ? notes
          .filter((n) => n.clauseKey === clauseKey && n.content.trim().length > 0)
          .map((n) => n.content.trim())
      : [];

    return {
      id: clause.id,
      numberLabel: localizeStructuralLabel(clause.number, language),
      principle: getLocalizedText(clause.principle, language),
      legalText: getLocalizedText(clause.text, language),
      parallelLanguageName: compareLang ? compareLanguageName ?? compareLang.toUpperCase() : undefined,
      parallelText: compareLang ? getLocalizedText(clause.text, compareLang) : undefined,
      explanation: options.includeExplanations
        ? getLocalizedText(clause.explanation, language)
        : undefined,
      realWorldExample: options.includeRealWorldExamples
        ? getLocalizedText(clause.realWorldExample, language)
        : undefined,
      studyNotes: clauseNotes,
    };
  });

  const combinedText = [
    bookTitle,
    chapterNumberLabel,
    chapterTitle,
    chapterSummary,
    ...clauses.flatMap((c) => [
      c.numberLabel,
      c.principle,
      c.legalText,
      c.parallelText ?? '',
      c.explanation ?? '',
      c.realWorldExample ?? '',
      ...c.studyNotes,
    ]),
  ]
    .filter(Boolean)
    .join(' ');

  const wordCount = combinedText
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  // Estimate pages (~320 words per formatted legal page including margins & callouts)
  const estimatedPages = Math.max(1, Math.ceil((wordCount + clauses.length * 35) / 340));

  const generatedAtDisplay = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return {
    filename: sanitizeExportFilename(book.shortTitle || book.title.en, chapter.number, language),
    bookTitle,
    bookShortTitle: book.shortTitle,
    jurisdiction: book.jurisdiction,
    year: book.year,
    chapterNumberLabel,
    chapterTitle,
    chapterSummary,
    languageCode: language,
    languageName,
    generatedAtIso: now.toISOString(),
    generatedAtDisplay,
    paperSize: options.paperSize,
    clauses,
    wordCount,
    estimatedPages,
    containsNonLatinScript: containsNonLatinText(combinedText),
  };
}

/**
 * Pure deterministic paginator used to split formatted blocks into fixed-capacity pages.
 */
export function paginateExportBlocks(
  blocks: PaginatedExportBlock[],
  maxLinesPerPage: number
): PaginatedExportBlock[][] {
  const safeCapacity = Math.max(4, maxLinesPerPage);
  const pages: PaginatedExportBlock[][] = [];
  let currentPage: PaginatedExportBlock[] = [];
  let usedLines = 0;

  for (const block of blocks) {
    const cost = Math.max(1, block.lines.length + 1);
    if (currentPage.length > 0 && usedLines + cost > safeCapacity) {
      pages.push(currentPage);
      currentPage = [];
      usedLines = 0;
    }
    currentPage.push(block);
    usedLines += cost;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [[]];
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const output: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${line} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        output.push(line);
        line = words[i];
      }
    }
    output.push(line);
  }

  return output;
}

/**
 * Renders a crisp high-DPI Canvas-backed multi-page PDF for Unicode scripts (Telugu, Hindi, Arabic)
 * so every glyph and ligature renders cleanly using the browser's native font shaping engine.
 */
function buildUnicodeCanvasPdf(docData: ChapterExportDocument): jsPDF {
  const isA4 = docData.paperSize === 'a4';
  const pageWidthPt = isA4 ? 595.28 : 612;
  const pageHeightPt = isA4 ? 841.89 : 792;
  const scale = 1.75;
  const pageW = Math.round(pageWidthPt * scale);
  const pageH = Math.round(pageHeightPt * scale);
  const margin = 48 * scale;
  const contentW = pageW - margin * 2;
  const footerReserved = 42 * scale;
  const maxY = pageH - margin - footerReserved;

  const canvases: HTMLCanvasElement[] = [];

  const createPageCanvas = () => {
    const canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable for PDF rendering.');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pageW, pageH);
    ctx.textBaseline = 'top';
    canvases.push(canvas);
    return { canvas, ctx };
  };

  let current = createPageCanvas();
  let y = margin;

  const ensureSpace = (neededPx: number) => {
    if (y + neededPx > maxY && y > margin + 20) {
      const prevFont = current.ctx.font;
      const prevFill = current.ctx.fillStyle;
      current = createPageCanvas();
      current.ctx.font = prevFont;
      current.ctx.fillStyle = prevFill;
      y = margin;
    }
  };

  // Document Masthead
  current.ctx.fillStyle = '#2563EB';
  current.ctx.fillRect(margin, y, contentW, 4 * scale);
  y += 14 * scale;

  current.ctx.fillStyle = '#2563EB';
  current.ctx.font = `700 ${10 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
  current.ctx.fillText(
    `${docData.jurisdiction.toUpperCase()}  ·  ${docData.year}  ·  ${docData.languageName.toUpperCase()}`,
    margin,
    y
  );
  y += 18 * scale;

  current.ctx.fillStyle = '#0C1018';
  current.ctx.font = `700 ${13 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
  for (const line of wrapCanvasText(current.ctx, docData.bookTitle, contentW)) {
    current.ctx.fillText(line, margin, y);
    y += 18 * scale;
  }

  y += 4 * scale;
  current.ctx.fillStyle = '#0C1018';
  current.ctx.font = `700 ${20 * scale}px "Bricolage Grotesque", "Noto Sans Telugu", sans-serif`;
  for (const line of wrapCanvasText(
    current.ctx,
    `${docData.chapterNumberLabel} — ${docData.chapterTitle}`,
    contentW
  )) {
    current.ctx.fillText(line, margin, y);
    y += 26 * scale;
  }

  y += 4 * scale;
  current.ctx.fillStyle = '#475569';
  current.ctx.font = `400 ${11 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
  for (const line of wrapCanvasText(current.ctx, docData.chapterSummary, contentW)) {
    current.ctx.fillText(line, margin, y);
    y += 16 * scale;
  }

  y += 10 * scale;
  current.ctx.strokeStyle = '#E2E8F0';
  current.ctx.lineWidth = 1 * scale;
  current.ctx.beginPath();
  current.ctx.moveTo(margin, y);
  current.ctx.lineTo(margin + contentW, y);
  current.ctx.stroke();
  y += 18 * scale;

  // Clauses
  for (const clause of docData.clauses) {
    ensureSpace(88 * scale);

    current.ctx.fillStyle = '#2563EB';
    current.ctx.font = `700 ${10 * scale}px "JetBrains Mono", "Noto Sans Telugu", monospace`;
    current.ctx.fillText(clause.numberLabel.toUpperCase(), margin, y);
    y += 15 * scale;

    current.ctx.fillStyle = '#0F172A';
    current.ctx.font = `700 ${13 * scale}px "Bricolage Grotesque", "Noto Sans Telugu", sans-serif`;
    for (const line of wrapCanvasText(current.ctx, clause.principle, contentW)) {
      ensureSpace(20 * scale);
      current.ctx.fillText(line, margin, y);
      y += 18 * scale;
    }

    y += 4 * scale;
    current.ctx.fillStyle = '#1E293B';
    current.ctx.font = `400 ${11.5 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
    for (const line of wrapCanvasText(current.ctx, clause.legalText, contentW)) {
      ensureSpace(18 * scale);
      current.ctx.fillText(line, margin, y);
      y += 17 * scale;
    }

    if (clause.parallelText) {
      y += 6 * scale;
      current.ctx.fillStyle = '#334155';
      current.ctx.font = `600 ${9.5 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
      ensureSpace(34 * scale);
      current.ctx.fillText(`Parallel (${clause.parallelLanguageName ?? ''})`, margin + 10 * scale, y);
      y += 14 * scale;
      current.ctx.font = `400 ${10.5 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
      for (const line of wrapCanvasText(current.ctx, clause.parallelText, contentW - 14 * scale)) {
        ensureSpace(16 * scale);
        current.ctx.fillText(line, margin + 10 * scale, y);
        y += 15 * scale;
      }
    }

    if (clause.explanation) {
      y += 8 * scale;
      current.ctx.font = `400 ${10.5 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
      const expLines = wrapCanvasText(current.ctx, clause.explanation, contentW - 22 * scale);
      const boxHeight = (26 + expLines.length * 15) * scale;
      ensureSpace(Math.min(boxHeight, 120 * scale));
      current.ctx.fillStyle = '#F8FAFC';
      current.ctx.fillRect(margin, y, contentW, boxHeight);
      current.ctx.strokeStyle = '#E2E8F0';
      current.ctx.strokeRect(margin, y, contentW, boxHeight);

      let innerY = y + 9 * scale;
      current.ctx.fillStyle = '#B45309';
      current.ctx.font = `700 ${9 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
      current.ctx.fillText('DEEP EXPLANATION', margin + 11 * scale, innerY);
      innerY += 14 * scale;

      current.ctx.fillStyle = '#334155';
      current.ctx.font = `400 ${10.5 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
      for (const line of expLines) {
        current.ctx.fillText(line, margin + 11 * scale, innerY);
        innerY += 15 * scale;
      }
      y += boxHeight + 6 * scale;
    }

    if (clause.realWorldExample) {
      y += 4 * scale;
      current.ctx.fillStyle = '#475569';
      current.ctx.font = `400 ${10 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
      for (const line of wrapCanvasText(
        current.ctx,
        `Real-World Context: ${clause.realWorldExample}`,
        contentW
      )) {
        ensureSpace(16 * scale);
        current.ctx.fillText(line, margin, y);
        y += 15 * scale;
      }
    }

    if (clause.studyNotes.length > 0) {
      y += 6 * scale;
      current.ctx.fillStyle = '#1D4ED8';
      current.ctx.font = `700 ${9.5 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
      ensureSpace(24 * scale);
      current.ctx.fillText('PERSONAL STUDY NOTES', margin, y);
      y += 14 * scale;
      current.ctx.fillStyle = '#1E293B';
      current.ctx.font = `400 ${10 * scale}px "Plus Jakarta Sans", "Noto Sans Telugu", sans-serif`;
      for (const note of clause.studyNotes) {
        for (const line of wrapCanvasText(current.ctx, `• ${note}`, contentW - 8 * scale)) {
          ensureSpace(16 * scale);
          current.ctx.fillText(line, margin + 6 * scale, y);
          y += 15 * scale;
        }
      }
    }

    y += 14 * scale;
    current.ctx.strokeStyle = '#E2E8F0';
    current.ctx.lineWidth = 0.75 * scale;
    current.ctx.beginPath();
    current.ctx.moveTo(margin, y);
    current.ctx.lineTo(margin + contentW, y);
    current.ctx.stroke();
    y += 16 * scale;
  }

  // Stamp running page headers & footers
  const totalPages = canvases.length;
  canvases.forEach((canvas, idx) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const footerY = pageH - margin - 14 * scale;
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 0.75 * scale;
    ctx.beginPath();
    ctx.moveTo(margin, footerY - 8 * scale);
    ctx.lineTo(margin + contentW, footerY - 8 * scale);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = `500 ${9 * scale}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(
      `The Constitution & Law  ·  ${docData.bookShortTitle}  ·  Exported ${docData.generatedAtDisplay}`,
      margin,
      footerY
    );
    const pageLabel = `Page ${idx + 1} of ${totalPages}`;
    const labelW = ctx.measureText(pageLabel).width;
    ctx.fillText(pageLabel, margin + contentW - labelW, footerY);
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: docData.paperSize,
  });

  canvases.forEach((canvas, idx) => {
    if (idx > 0) pdf.addPage(docData.paperSize, 'portrait');
    const imgData = canvas.toDataURL('image/jpeg', 0.94);
    pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthPt, pageHeightPt, undefined, 'FAST');
  });

  return pdf;
}

/**
 * Generates a vector-sharp, selectable-text styled legal PDF for Latin-script chapters,
 * and seamlessly falls back to high-DPI Unicode Canvas pagination for Telugu/Hindi/Arabic scripts.
 */
export function createStyledChapterPdf(docData: ChapterExportDocument): jsPDF {
  if (docData.containsNonLatinScript && typeof document !== 'undefined') {
    return buildUnicodeCanvasPdf(docData);
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: docData.paperSize,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 50;
  const marginTop = 52;
  const footerSafeBottom = pageHeight - 54;
  const contentWidth = pageWidth - marginX * 2;

  let y = marginTop;

  const addNewPage = () => {
    pdf.addPage(docData.paperSize, 'portrait');
    y = marginTop;
  };

  const ensureVerticalSpace = (heightPt: number) => {
    if (y + heightPt > footerSafeBottom && y > marginTop + 20) {
      addNewPage();
    }
  };

  // Top cobalt legal accent rule
  pdf.setFillColor(37, 99, 235);
  pdf.rect(marginX, y, contentWidth, 3, 'F');
  y += 16;

  // Jurisdiction & metadata line
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(37, 99, 235);
  pdf.text(
    `${docData.jurisdiction.toUpperCase()}  ·  ${docData.year}  ·  ${docData.languageName.toUpperCase()}`,
    marginX,
    y
  );
  y += 16;

  // Book title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11.5);
  pdf.setTextColor(51, 65, 85);
  const bookTitleLines = pdf.splitTextToSize(docData.bookTitle, contentWidth) as string[];
  pdf.text(bookTitleLines, marginX, y);
  y += bookTitleLines.length * 15 + 4;

  // Chapter headline
  pdf.setFont('times', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(12, 16, 24);
  const chapterHeadingLines = pdf.splitTextToSize(
    `${docData.chapterNumberLabel}: ${docData.chapterTitle}`,
    contentWidth
  ) as string[];
  pdf.text(chapterHeadingLines, marginX, y);
  y += chapterHeadingLines.length * 24 + 4;

  // Chapter summary
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10.5);
  pdf.setTextColor(71, 85, 105);
  const summaryLines = pdf.splitTextToSize(docData.chapterSummary, contentWidth) as string[];
  pdf.text(summaryLines, marginX, y);
  y += summaryLines.length * 14.5 + 12;

  // Hairline divider
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.75);
  pdf.line(marginX, y, marginX + contentWidth, y);
  y += 18;

  // Clauses
  for (const clause of docData.clauses) {
    ensureVerticalSpace(84);

    // Clause citation & principle
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(37, 99, 235);
    pdf.text(clause.numberLabel.toUpperCase(), marginX, y);
    y += 14;

    pdf.setFont('times', 'bold');
    pdf.setFontSize(13.5);
    pdf.setTextColor(15, 23, 42);
    const principleLines = pdf.splitTextToSize(clause.principle, contentWidth) as string[];
    pdf.text(principleLines, marginX, y);
    y += principleLines.length * 16.5 + 5;

    // Statutory / Constitutional text
    pdf.setFont('times', 'normal');
    pdf.setFontSize(11.5);
    pdf.setTextColor(30, 41, 59);
    const legalLines = pdf.splitTextToSize(clause.legalText, contentWidth) as string[];
    for (const line of legalLines) {
      ensureVerticalSpace(16);
      pdf.text(line, marginX, y);
      y += 16;
    }

    // Optional Parallel Language text
    if (clause.parallelText) {
      y += 6;
      ensureVerticalSpace(34);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(37, 99, 235);
      pdf.text(
        `PARALLEL EDITION (${(clause.parallelLanguageName ?? '').toUpperCase()})`,
        marginX + 10,
        y
      );
      y += 13;

      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.setTextColor(71, 85, 105);
      const parallelLines = pdf.splitTextToSize(clause.parallelText, contentWidth - 14) as string[];
      for (const line of parallelLines) {
        ensureVerticalSpace(14);
        pdf.text(line, marginX + 10, y);
        y += 14;
      }
    }

    // Optional Deep Explanation callout
    if (clause.explanation) {
      y += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const expLines = pdf.splitTextToSize(clause.explanation, contentWidth - 24) as string[];
      const boxH = 26 + expLines.length * 14;
      ensureVerticalSpace(Math.min(boxH, 130));

      if (y + boxH <= footerSafeBottom) {
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(marginX, y, contentWidth, boxH, 5, 5, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(180, 83, 9);
        pdf.text('DEEP EXPLANATION', marginX + 12, y + 15);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(51, 65, 85);
        pdf.text(expLines, marginX + 12, y + 29);
        y += boxH + 6;
      } else {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(180, 83, 9);
        pdf.text('DEEP EXPLANATION', marginX, y + 10);
        y += 22;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(51, 65, 85);
        for (const line of expLines) {
          ensureVerticalSpace(14);
          pdf.text(line, marginX, y);
          y += 14;
        }
        y += 6;
      }
    }

    // Optional Real-World Context
    if (clause.realWorldExample) {
      y += 4;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(71, 85, 105);
      const exLines = pdf.splitTextToSize(
        `Real-World Context: ${clause.realWorldExample}`,
        contentWidth
      ) as string[];
      for (const line of exLines) {
        ensureVerticalSpace(14);
        pdf.text(line, marginX, y);
        y += 13.5;
      }
    }

    // Optional Study Notes
    if (clause.studyNotes.length > 0) {
      y += 6;
      ensureVerticalSpace(26);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(29, 78, 216);
      pdf.text('STUDY NOTES', marginX, y);
      y += 13;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9.5);
      pdf.setTextColor(30, 41, 59);
      for (const note of clause.studyNotes) {
        const noteLines = pdf.splitTextToSize(`• ${note}`, contentWidth - 10) as string[];
        for (const line of noteLines) {
          ensureVerticalSpace(14);
          pdf.text(line, marginX + 6, y);
          y += 13.5;
        }
      }
    }

    y += 12;
    ensureVerticalSpace(8);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.5);
    pdf.line(marginX, y, marginX + contentWidth, y);
    y += 16;
  }

  // Stamp running footers on all pages
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    pdf.setPage(p);
    const footerLineY = pageHeight - 36;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.6);
    pdf.line(marginX, footerLineY, marginX + contentWidth, footerLineY);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(
      `The Constitution & Law  ·  ${docData.bookShortTitle}  ·  Exported ${docData.generatedAtDisplay}`,
      marginX,
      footerLineY + 13
    );
    const pageLabel = `Page ${p} of ${totalPages}`;
    const labelW = pdf.getTextWidth(pageLabel);
    pdf.text(pageLabel, marginX + contentWidth - labelW, footerLineY + 13);
  }

  return pdf;
}

/**
 * Generates and downloads the formatted legal chapter PDF file directly in the browser.
 */
export function downloadStyledChapterPdf(docData: ChapterExportDocument): {
  filename: string;
  pageCount: number;
} {
  const pdf = createStyledChapterPdf(docData);
  const pageCount = pdf.getNumberOfPages();
  pdf.save(docData.filename);
  return { filename: docData.filename, pageCount };
}
