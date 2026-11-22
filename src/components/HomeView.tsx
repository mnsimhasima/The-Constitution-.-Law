import type { User } from 'firebase/auth';
import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Flame,
  Heart,
  Loader2,
  LogIn,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';
import {
  COMMUNITY_POSTS,
  DAILY_CIVIC_EVENTS,
  DAILY_CONSTITUTION_TASKS,
  DAILY_LEGAL_DROPS,
  DAILY_LEGAL_REELS,
  FEATURED_SPOTLIGHT,
  HERO_STUDIO_IMAGE,
  SUPPORTED_LANGUAGES,
} from '../data/booksData';
import type { CommunityModerationResponse, ModerationCommunityPost } from '../types/backend';
import type { LanguageCode, LawBook, StudioSubTab } from '../types/library';
import { getLocalizedText } from '../utils/libraryLogic';
import { computeReadingStreakSummary } from '../utils/readingStreak';
import { ReadingStreakWidget } from './ReadingStreakWidget';

interface HomeViewProps {
  studioSubTab: StudioSubTab;
  books: LawBook[];
  language: LanguageCode;
  user: User | null;
  liveCommunityPosts: ModerationCommunityPost[];
  streakDays: number;
  dailyReadingMinutes: Record<string, number>;
  audioMinutes: number;
  completedTaskIds: string[];
  rsvpEventIds: string[];
  likedPostIds: string[];
  followedPeopleIds: string[];
  isAudioPlaying: boolean;
  activeAudioClauseId?: string;
  onToggleDailyTask: (taskId: string, taskTitle?: string) => void;
  onToggleEventRsvp: (eventId: string, eventTitle?: string) => void;
  onTogglePostLike: (postId: string) => void;
  onToggleFollowPerson: (personId: string) => void;
  onSubmitCommunityPost: (
    content: string,
    tag: string,
    bookId: string,
    chapterId: string,
    author: { uid: string; displayName: string; email: string }
  ) => Promise<CommunityModerationResponse & { post?: ModerationCommunityPost }>;
  onOpenAuthModal: () => void;
  onOpenReader: (bookId: string, chapterId: string, clauseId?: string) => void;
  onPlayChapterAudio: (bookId: string, chapterId: string, startClauseIndex?: number) => void;
  onLogReadingMinutes: (deltaMinutes: number) => void;
  onNavigateProfile: () => void;
}

export function HomeView({
  studioSubTab,
  books,
  language,
  user,
  liveCommunityPosts,
  streakDays,
  dailyReadingMinutes,
  audioMinutes,
  completedTaskIds,
  rsvpEventIds,
  likedPostIds,
  followedPeopleIds,
  isAudioPlaying,
  activeAudioClauseId,
  onToggleDailyTask,
  onToggleEventRsvp,
  onTogglePostLike,
  onToggleFollowPerson,
  onSubmitCommunityPost,
  onOpenAuthModal,
  onOpenReader,
  onPlayChapterAudio,
  onLogReadingMinutes,
  onNavigateProfile,
}: HomeViewProps) {
  const [dropIndex, setDropIndex] = useState(0);
  const [postDraft, setPostDraft] = useState('');
  const [postTag, setPostTag] = useState('Constitutional Reflection');
  const [postBookId, setPostBookId] = useState(books[0]?.id ?? 'constitution-india');
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);

  const spotlightBook = books.find((b) => b.id === FEATURED_SPOTLIGHT.bookId) ?? books[0];
  const spotlightChapter =
    spotlightBook?.chapters.find((c) => c.id === FEATURED_SPOTLIGHT.chapterId) ??
    spotlightBook?.chapters[0];
  const spotlightClauseIdx = Math.max(
    0,
    spotlightChapter?.clauses.findIndex((cl) => cl.id === FEATURED_SPOTLIGHT.clauseId) ?? 0
  );
  const spotlightClause =
    spotlightChapter?.clauses[spotlightClauseIdx] ?? spotlightChapter?.clauses[0];

  const activeDrop = DAILY_LEGAL_DROPS[dropIndex % DAILY_LEGAL_DROPS.length];
  const dropBook = books.find((b) => b.id === activeDrop.bookId) ?? books[0];
  const dropChapter =
    dropBook?.chapters.find((c) => c.id === activeDrop.chapterId) ?? dropBook?.chapters[0];
  const dropClauseIdx = Math.max(
    0,
    dropChapter?.clauses.findIndex((cl) => cl.id === activeDrop.clauseId) ?? 0
  );
  const dropClause = dropChapter?.clauses[dropClauseIdx] ?? dropChapter?.clauses[0];

  const isSpotlightPlaying = Boolean(isAudioPlaying && activeAudioClauseId === spotlightClause?.id);
  const activeLangMeta =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];
  const liveStreakDays =
    computeReadingStreakSummary(dailyReadingMinutes, new Date()).currentStreakDays || streakDays;

  const handlePublishCommunityPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuthModal();
      return;
    }
    setPostError(null);
    setPostSuccess(null);
    setPostSubmitting(true);

    try {
      const targetBook = books.find((b) => b.id === postBookId) ?? books[0];
      const result = await onSubmitCommunityPost(
        postDraft,
        postTag,
        targetBook?.id ?? 'constitution-india',
        targetBook?.chapters[0]?.id ?? 'ind-preamble-rights',
        {
          uid: user.uid,
          displayName: user.displayName ?? 'Civic Reader',
          email: user.email ?? 'reader@constitutionlaw.org',
        }
      );

      if (!result.allowed) {
        setPostError(
          result.errorMessage ??
            "This content is not related to this community, so you shouldn't post this."
        );
      } else {
        setPostDraft('');
        setPostSuccess('Your constitutional reflection was verified and posted to the community!');
      }
    } catch {
      setPostError('Could not connect to community moderation right now. Please try again.');
    } finally {
      setPostSubmitting(false);
    }
  };

  // COMMUNITY TAB VIEW (Text-Only Moderated Social Feed + Live Backend Posts)
  if (studioSubTab === 'community') {
    const approvedLivePosts = liveCommunityPosts.filter((p) => p.moderationStatus === 'approved');

    return (
      <div className="space-y-5">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-gradient-to-br from-[#0F1E4A] via-[#172554] to-[#2563EB] p-5 text-white shadow-lg">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200">
              <Users className="h-3.5 w-3.5" />
              Civic Study Community
            </p>
            <h1 className="mt-1 font-display text-xl font-bold">
              Shared Constitutional Notes &amp; Study Circles
            </h1>
          </div>
          <button
            type="button"
            onClick={onNavigateProfile}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 text-xs font-bold text-slate-950 transition hover:bg-blue-50 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Find Friends
          </button>
        </section>

        {/* Text-Only AI-Moderated Post Composer */}
        <section className="rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Share a Text-Only Constitutional Thought
              </h2>
            </div>
            <span className="font-mono text-[10px] font-semibold uppercase text-slate-400">
              Text Only · Moderated
            </span>
          </div>

          {!user ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-[#0D111A]">
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Sign in with your Google account to post reflections on constitutions, rights, and laws. Everyone can read and like posts.
              </p>
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white transition hover:bg-[#1D4ED8] cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign In to Post
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void handlePublishCommunityPost(e)} className="mt-3 space-y-3">
              <textarea
                rows={3}
                maxLength={1000}
                value={postDraft}
                onChange={(e) => {
                  setPostDraft(e.target.value);
                  if (postError) setPostError(null);
                }}
                placeholder="Write a plain-text thought about an Article, legal right, or Dr. B. R. Ambedkar’s work (no links or inappropriate language)…"
                aria-label="Community post text"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />

              {postError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{postError}</span>
                </div>
              )}

              {postSuccess && (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{postSuccess}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Topic tag"
                    value={postTag}
                    onChange={(e) => setPostTag(e.target.value)}
                    className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200"
                  >
                    <option value="Constitutional Reflection">Constitutional Reflection</option>
                    <option value="Fundamental Rights">Fundamental Rights</option>
                    <option value="Ambedkar Legacy">Ambedkar Legacy</option>
                    <option value="Statutory Law Study">Statutory Law Study</option>
                  </select>

                  <select
                    aria-label="Linked book"
                    value={postBookId}
                    onChange={(e) => setPostBookId(e.target.value)}
                    className="h-9 max-w-[165px] rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200"
                  >
                    {books.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.shortTitle}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={postSubmitting || postDraft.trim().length === 0}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {postSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Checking…
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Post Text
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Live Moderated Community Feed + Curated Community Posts */}
        <div className="space-y-4">
          {approvedLivePosts.map((post) => {
            const liked = likedPostIds.includes(post.id);
            const following = followedPeopleIds.includes(post.authorId);
            const postBook = books.find((b) => b.id === post.bookId);

            return (
              <article
                key={post.id}
                className="min-w-0 rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-display text-xs font-bold text-white ${post.authorTone}`}
                    >
                      {post.authorInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold text-slate-950 dark:text-white">
                        {post.authorName}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {post.tag} · {post.createdAt.slice(0, 10)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleFollowPerson(post.authorId)}
                    className={`min-h-[34px] shrink-0 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                      following
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                        : 'border border-slate-200 text-slate-700 hover:border-blue-500 dark:border-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                </div>

                <p className="mt-3.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                  {post.content}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => onTogglePostLike(post.id)}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                      liked
                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                    <span className="font-mono">{post.likesCount + (liked ? 1 : 0)}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenReader(post.bookId, post.chapterId)}
                    className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                  >
                    <span>Read in {postBook?.shortTitle ?? 'Reader'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}

          {COMMUNITY_POSTS.map((post) => {
            const liked = likedPostIds.includes(post.id);
            const following = followedPeopleIds.includes(post.authorId);
            const postBook = books.find((b) => b.id === post.bookId);

            return (
              <article
                key={post.id}
                className="min-w-0 rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-display text-xs font-bold text-white ${post.authorTone}`}
                    >
                      {post.authorInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold text-slate-950 dark:text-white">
                        {post.authorName}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {post.tag} · {post.timeAgo}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleFollowPerson(post.authorId)}
                    className={`min-h-[34px] shrink-0 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                      following
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                        : 'border border-slate-200 text-slate-700 hover:border-blue-500 dark:border-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {following ? 'Following' : 'Follow'}
                  </button>
                </div>

                <p className="mt-3.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                  {getLocalizedText(post.content, language)}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => onTogglePostLike(post.id)}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                      liked
                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                    <span className="font-mono">{post.baseLikes + (liked ? 1 : 0)}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenReader(post.bookId, post.chapterId, post.clauseId)}
                    className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                  >
                    <span>Read in {postBook?.shortTitle ?? 'Reader'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  // TODAY CONTENT TAB VIEW (Daily Constitution Spotlight, Daily Tasks, Daily Reels, Daily Updates, Daily Events)
  return (
    <div className="space-y-6">
      {/* Row 1: Daily Constitution Spotlight + Daily Constitution Tasks */}
      <section className="grid gap-5 lg:grid-cols-12">
        {spotlightBook && spotlightChapter && spotlightClause && (
          <div className="relative flex min-h-[320px] min-w-0 flex-col justify-between overflow-hidden rounded-[26px] bg-[#0B1120] p-5 text-white shadow-xl sm:p-7 lg:col-span-7">
            <img
              src={HERO_STUDIO_IMAGE}
              alt="Constitutional studio atrium"
              className="absolute inset-0 h-full w-full object-cover opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#070B14] via-[#0B1328]/78 to-[#0B1328]/45" />

            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-blue-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Today’s Constitution Spotlight</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-slate-200 tabular-nums">
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span>{liveStreakDays}d</span>
                <span className="opacity-50">·</span>
                <span>{activeLangMeta.shortCode}</span>
              </div>
            </div>

            <div className="relative z-10 my-4 max-w-2xl">
              <p className="text-xs font-semibold text-blue-200/90">
                {getLocalizedText(spotlightBook.title, language)} · {spotlightClause.number}
              </p>
              <h1 className="mt-1.5 font-display text-2xl font-bold leading-tight tracking-tight text-white sm:text-[28px]">
                {getLocalizedText(spotlightClause.principle, language)}
              </h1>
              <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-slate-200">
                “{getLocalizedText(spotlightClause.text, language)}”
              </p>
            </div>

            <div className="relative z-10 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  onPlayChapterAudio(spotlightBook.id, spotlightChapter.id, spotlightClauseIdx)
                }
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-[#2563EB] px-5 text-xs font-bold text-white shadow-lg shadow-blue-600/35 transition hover:bg-[#1D4ED8] cursor-pointer"
              >
                <Volume2 className="h-4 w-4" />
                {isSpotlightPlaying ? 'Playing Audio' : 'Listen Now'}
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenReader(spotlightBook.id, spotlightChapter.id, spotlightClause.id)
                }
                className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20 cursor-pointer"
              >
                <BookOpen className="h-4 w-4" />
                Read & Explain
              </button>
            </div>
          </div>
        )}

        {/* Daily Constitution Tasks */}
        <div className="flex min-w-0 flex-col justify-between rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620] lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                Daily Constitution Tasks
              </p>
              <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                {completedTaskIds.length}/{DAILY_CONSTITUTION_TASKS.length} · {audioMinutes}m
              </span>
            </div>

            <div className="mt-3.5 space-y-2.5">
              {DAILY_CONSTITUTION_TASKS.map((task) => {
                const done = completedTaskIds.includes(task.id);
                const title = getLocalizedText(task.title, language);
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-[#0D111A]"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleDailyTask(task.id, title)}
                      aria-label={done ? `Uncheck ${title}` : `Complete ${title}`}
                      className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400 cursor-pointer"
                    >
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 fill-blue-600 text-white dark:fill-blue-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenReader(task.bookId, task.chapterId, task.clauseId)}
                      className="min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <p
                        className={`text-xs font-bold leading-snug ${
                          done
                            ? 'text-slate-400 line-through dark:text-slate-500'
                            : 'text-slate-950 dark:text-white'
                        }`}
                      >
                        {title}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {getLocalizedText(task.subtitle, language)}
                      </p>
                    </button>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-slate-400">
                      {task.durationLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Row 1.5: Reading Streak Widget */}
      <ReadingStreakWidget
        dailyMinutes={dailyReadingMinutes}
        onCheckInToday={() => onLogReadingMinutes(5)}
        onOpenReader={() => {
          if (spotlightBook && spotlightChapter) {
            onOpenReader(spotlightBook.id, spotlightChapter.id, spotlightClause?.id);
          }
        }}
        onViewProgress={onNavigateProfile}
      />

      {/* Row 2: Daily Legal Reels */}
      <section aria-labelledby="daily-reels-heading" className="space-y-3.5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">
              Quick Audio Shorts
            </p>
            <h2
              id="daily-reels-heading"
              className="mt-0.5 font-display text-xl font-bold text-slate-950 dark:text-white"
            >
              Daily Reels
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {DAILY_LEGAL_REELS.map((reel) => {
            const book = books.find((b) => b.id === reel.bookId);
            const chapter = book?.chapters.find((c) => c.id === reel.chapterId);
            const clauseIdx = Math.max(
              0,
              chapter?.clauses.findIndex((cl) => cl.id === reel.clauseId) ?? 0
            );

            return (
              <article
                key={reel.id}
                className={`flex min-w-0 flex-col justify-between rounded-[24px] bg-gradient-to-br p-5 text-white shadow-md ${reel.tone}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
                      {reel.tag}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-amber-300">
                      {reel.duration}
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-base font-bold leading-snug text-white">
                    {getLocalizedText(reel.title, language)}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/85">
                    {getLocalizedText(reel.caption, language)}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlayChapterAudio(reel.bookId, reel.chapterId, clauseIdx)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-bold text-slate-950 transition hover:bg-blue-50 cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Play Reel
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenReader(reel.bookId, reel.chapterId, reel.clauseId)}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 cursor-pointer"
                  >
                    Read
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Row 3: Daily Updates & Daily Civic Events */}
      <section className="grid gap-5 lg:grid-cols-12">
        {/* Daily Updates / Legal Drops */}
        {dropBook && dropChapter && dropClause && (
          <div className="flex min-w-0 flex-col justify-between rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620] lg:col-span-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                Daily Updates · {dropIndex + 1}/{DAILY_LEGAL_DROPS.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setDropIndex(
                      (prev) => (prev - 1 + DAILY_LEGAL_DROPS.length) % DAILY_LEGAL_DROPS.length
                    )
                  }
                  aria-label="Previous update"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDropIndex((prev) => (prev + 1) % DAILY_LEGAL_DROPS.length)}
                  aria-label="Next update"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="my-3.5">
              <h2 className="font-display text-lg font-bold leading-snug text-slate-950 dark:text-white">
                {getLocalizedText(dropClause.principle, language)}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {getLocalizedText(dropClause.explanation, language)}
              </p>
              <p className="mt-2 text-xs font-medium text-slate-400">
                {dropBook.shortTitle} · {dropClause.number}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onPlayChapterAudio(dropBook.id, dropChapter.id, dropClauseIdx)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-blue-600 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Play Update
              </button>
              <button
                type="button"
                onClick={() => onOpenReader(dropBook.id, dropChapter.id, dropClause.id)}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-200 px-3.5 text-xs font-bold text-slate-700 transition hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Open Clause
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Daily Civic Events */}
        <div className="min-w-0 rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620] lg:col-span-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
              Daily Events
            </h2>
          </div>

          <div className="mt-3.5 space-y-3">
            {DAILY_CIVIC_EVENTS.map((evt) => {
              const joined = rsvpEventIds.includes(evt.id);
              const title = getLocalizedText(evt.title, language);
              return (
                <div
                  key={evt.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-[#0D111A] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
                      {evt.dateLabel} · {evt.timeLabel}
                    </p>
                    <p className="mt-1 font-display text-sm font-bold leading-snug text-slate-950 dark:text-white">
                      {title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {evt.host} · {evt.attendees + (joined ? 1 : 0)} going
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleEventRsvp(evt.id, title)}
                    className={`min-h-[38px] shrink-0 rounded-xl px-4 text-xs font-bold transition cursor-pointer ${
                      joined
                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30'
                        : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
                    }`}
                  >
                    {joined ? 'Going ✓' : 'Join Event'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
