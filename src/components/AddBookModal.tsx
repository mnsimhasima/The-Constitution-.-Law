import { useState } from 'react';
import { BookPlus, Languages, X } from 'lucide-react';
import type { BookCategory, LawBook, NewBookFormInput } from '../types/library';
import { createCustomBook, validateNewBookInput } from '../utils/libraryLogic';

interface AddBookModalProps {
  isOpen: boolean;
  isSignedIn: boolean;
  onClose: () => void;
  onAddBook: (book: LawBook) => void;
}

const INITIAL_FORM: NewBookFormInput = {
  title: '',
  shortTitle: '',
  jurisdiction: '',
  year: String(new Date().getFullYear()),
  category: 'statutory',
  chapterTitle: '',
  clauseNumber: 'Section 1',
  principle: '',
  clauseTextEn: '',
  explanationEn: '',
  realWorldExampleEn: '',
  clauseTextTe: '',
  explanationTe: '',
  clauseTextHi: '',
  explanationHi: '',
  clauseTextEs: '',
  explanationEs: '',
};

export function AddBookModal({ isOpen, isSignedIn, onClose, onAddBook }: AddBookModalProps) {
  const [form, setForm] = useState<NewBookFormInput>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof NewBookFormInput, string>>>({});
  const [showMoreLanguages, setShowMoreLanguages] = useState(false);

  if (!isOpen) return null;

  const updateField = <K extends keyof NewBookFormInput>(field: K, value: NewBookFormInput[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateNewBookInput(form);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    const created = createCustomBook(form);
    onAddBook(created);
    setForm(INITIAL_FORM);
    setErrors({});
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090B10]/70 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-book-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#121620]"
      >
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              <BookPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 id="add-book-title" className="font-display text-lg font-bold text-slate-950 dark:text-white">
                Add Constitution, Law or History Book
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSignedIn
                  ? 'Saved privately to your Firestore cloud vault with instant audio narration.'
                  : 'Saved to your device library with instant English & Telugu audio narration.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close add book modal"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
                Book Title *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="e.g. Right to Education Act"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
              {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
                Short Shelf Label
              </label>
              <input
                type="text"
                value={form.shortTitle}
                onChange={(e) => updateField('shortTitle', e.target.value)}
                placeholder="e.g. RTE Act 2009"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
                Jurisdiction / Domain *
              </label>
              <input
                type="text"
                value={form.jurisdiction}
                onChange={(e) => updateField('jurisdiction', e.target.value)}
                placeholder="e.g. India · Education Law"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
              {errors.jurisdiction && <p className="mt-1 text-xs text-rose-600">{errors.jurisdiction}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">Category</label>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value as BookCategory)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              >
                <option value="constitutions">Constitution</option>
                <option value="history">Ambedkar & History</option>
                <option value="statutory">Law & Statute</option>
                <option value="international">Human Rights</option>
                <option value="custom">Custom Book</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">Year</label>
              <input
                type="text"
                value={form.year}
                onChange={(e) => updateField('year', e.target.value)}
                placeholder="2026"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
                First Chapter Title *
              </label>
              <input
                type="text"
                value={form.chapterTitle}
                onChange={(e) => updateField('chapterTitle', e.target.value)}
                placeholder="e.g. Right to Free & Compulsory Education"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
              {errors.chapterTitle && <p className="mt-1 text-xs text-rose-600">{errors.chapterTitle}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
                Article / Section *
              </label>
              <input
                type="text"
                value={form.clauseNumber}
                onChange={(e) => updateField('clauseNumber', e.target.value)}
                placeholder="Section 3"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
              {errors.clauseNumber && <p className="mt-1 text-xs text-rose-600">{errors.clauseNumber}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
              Core Legal Principle
            </label>
            <input
              type="text"
              value={form.principle}
              onChange={(e) => updateField('principle', e.target.value)}
              placeholder="e.g. Universal Access to Primary Schooling"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
              Official Text (English) *
            </label>
            <textarea
              rows={3}
              value={form.clauseTextEn}
              onChange={(e) => updateField('clauseTextEn', e.target.value)}
              placeholder="Enter the constitutional article, statutory section, or historical narrative…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
            />
            {errors.clauseTextEn && <p className="mt-1 text-xs text-rose-600">{errors.clauseTextEn}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
              Plain-Language Explanation (English) *
            </label>
            <textarea
              rows={2}
              value={form.explanationEn}
              onChange={(e) => updateField('explanationEn', e.target.value)}
              placeholder="Explain what this law means in everyday life…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
            />
            {errors.explanationEn && <p className="mt-1 text-xs text-rose-600">{errors.explanationEn}</p>}
          </div>

          {/* Dedicated Telugu Translation Block */}
          <div className="space-y-3 rounded-2xl border border-blue-200/80 bg-blue-50/50 p-4 dark:border-blue-500/25 dark:bg-blue-500/10">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-800 dark:text-blue-200">
              <Languages className="h-4 w-4" />
              <span>Telugu Edition (తెలుగు పాఠ్యం & వివరణ — Optional)</span>
            </div>
            <textarea
              rows={2}
              value={form.clauseTextTe ?? ''}
              onChange={(e) => updateField('clauseTextTe', e.target.value)}
              placeholder="తెలుగులో చట్టం లేదా చరిత్ర పాఠ్యం…"
              className="w-full rounded-xl border border-blue-200/80 bg-white p-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
            />
            <textarea
              rows={2}
              value={form.explanationTe ?? ''}
              onChange={(e) => updateField('explanationTe', e.target.value)}
              placeholder="తెలుగులో సులభమైన వివరణ…"
              className="w-full rounded-xl border border-blue-200/80 bg-white p-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
            />
          </div>

          {/* Additional Languages Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowMoreLanguages((prev) => !prev)}
              className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
            >
              {showMoreLanguages ? 'Hide Hindi & Spanish fields' : '+ Add Hindi / Spanish translations'}
            </button>

            {showMoreLanguages && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <textarea
                  rows={2}
                  value={form.explanationHi ?? ''}
                  onChange={(e) => updateField('explanationHi', e.target.value)}
                  placeholder="Hindi explanation (हिन्दी विवरण)…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
                />
                <textarea
                  rows={2}
                  value={form.explanationEs ?? ''}
                  onChange={(e) => updateField('explanationEs', e.target.value)}
                  placeholder="Spanish explanation (Explicación en español)…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200/80 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-2xl border border-slate-200 px-5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] rounded-2xl bg-[#2563EB] px-6 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-[#1D4ED8] cursor-pointer"
            >
              Publish to Library
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
