import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import {
  audioQueueReducer,
  buildFullChapterPlaybackQueue,
  getLookaheadPrefetchSegments,
  getQueueProgressSummary,
  INITIAL_AUDIO_QUEUE_STATE,
} from './audioQueueController';
import { CHAPTER_HEADER_CLAUSE_ID } from './libraryLogic';

test('buildFullChapterPlaybackQueue orders Magna Carta into Header -> Clause 39 Headline/Content/Explanation -> Clause 40 Headline/Content/Explanation', () => {
  const magnaCarta = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaCarta);
  const chapter = magnaCarta.chapters[0];

  const { queue, startIndex } = buildFullChapterPlaybackQueue(magnaCarta, chapter, 'te', 'both', 0, true);
  assert.equal(startIndex, 0);
  assert.equal(queue.length, 7);

  assert.deepEqual(
    queue.map((s) => `${s.clauseId}:${s.kind}`),
    [
      `${CHAPTER_HEADER_CLAUSE_ID}:header`,
      'mc-c39:headline',
      'mc-c39:text',
      'mc-c39:explanation',
      'mc-c40:headline',
      'mc-c40:text',
      'mc-c40:explanation',
    ]
  );

  // Starting from Clause 40 still loads the FULL chapter queue but starts at Clause 40's headline index (4)
  const midStart = buildFullChapterPlaybackQueue(magnaCarta, chapter, 'te', 'both', 1, false);
  assert.equal(midStart.queue.length, 7);
  assert.equal(midStart.startIndex, 4);
  assert.equal(midStart.queue[midStart.startIndex].kind, 'headline');
  assert.equal(midStart.queue[midStart.startIndex].clauseId, 'mc-c40');
});

test('audioQueueReducer automatically advances through every element in order until chapter completes', () => {
  const magnaCarta = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaCarta);
  const chapter = magnaCarta.chapters[0];
  const built = buildFullChapterPlaybackQueue(magnaCarta, chapter, 'en', 'both', 0, true);

  let state = audioQueueReducer(INITIAL_AUDIO_QUEUE_STATE, {
    type: 'LOAD_CHAPTER_QUEUE',
    bookId: magnaCarta.id,
    bookTitle: magnaCarta.title.en,
    chapterId: chapter.id,
    chapterLabel: chapter.number,
    queue: built.queue,
    startIndex: built.startIndex,
  });

  assert.equal(state.currentIndex, 0);
  assert.equal(state.status, 'loading');
  assert.equal(state.isPlaying, true);

  // Advance automatically through all 7 items via CLIP_ENDED
  const visitedKinds: string[] = [];
  for (let i = 0; i < built.queue.length; i++) {
    visitedKinds.push(state.queue[state.currentIndex].kind);
    const prevTrigger = state.playbackTrigger;
    state = audioQueueReducer(state, { type: 'CLIP_PLAYING', durationSeconds: 8 });
    state = audioQueueReducer(state, { type: 'CLIP_ENDED' });
    if (i < built.queue.length - 1) {
      assert.equal(state.currentIndex, i + 1);
      assert.equal(state.isPlaying, true);
      assert.equal(state.status, 'loading');
      assert.equal(state.playbackTrigger, prevTrigger + 1);
    }
  }

  assert.deepEqual(visitedKinds, [
    'header',
    'headline',
    'text',
    'explanation',
    'headline',
    'text',
    'explanation',
  ]);
  assert.equal(state.status, 'completed');
  assert.equal(state.isPlaying, false);
  assert.equal(state.completedIds.length, 7);

  // Restarting after completion returns to index 0 (chapter header)
  state = audioQueueReducer(state, { type: 'RESTART_OR_RETRY' });
  assert.equal(state.currentIndex, 0);
  assert.equal(state.completedIds.length, 0);
  assert.equal(state.isPlaying, true);
});

test('audioQueueReducer respects autoAdvance=false and supports jump, step, and in-place language rebuild', () => {
  const magnaCarta = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaCarta);
  const chapter = magnaCarta.chapters[0];
  const builtEn = buildFullChapterPlaybackQueue(magnaCarta, chapter, 'en', 'both', 0, true);

  let state = audioQueueReducer(INITIAL_AUDIO_QUEUE_STATE, {
    type: 'SET_AUTO_ADVANCE',
    enabled: false,
  });
  state = audioQueueReducer(state, {
    type: 'LOAD_CHAPTER_QUEUE',
    bookId: magnaCarta.id,
    bookTitle: magnaCarta.title.en,
    chapterId: chapter.id,
    chapterLabel: chapter.number,
    queue: builtEn.queue,
    startIndex: 0,
  });
  state = audioQueueReducer(state, { type: 'CLIP_ENDED' });
  // Should NOT advance when autoAdvance is false
  assert.equal(state.currentIndex, 0);
  assert.equal(state.status, 'paused');
  assert.equal(state.isPlaying, false);

  // Jump directly to Clause 39 Deep Explanation (index 3)
  state = audioQueueReducer(state, { type: 'JUMP_TO_INDEX', index: 3, autoPlay: true });
  assert.equal(state.currentIndex, 3);
  assert.equal(state.queue[3].kind, 'explanation');
  assert.equal(state.isPlaying, true);

  // Switch language to Telugu in-place — must preserve Clause 39 Explanation index!
  const builtTe = buildFullChapterPlaybackQueue(magnaCarta, chapter, 'te', 'both', 0, true);
  state = audioQueueReducer(state, {
    type: 'REBUILD_QUEUE_IN_PLACE',
    bookTitle: magnaCarta.title.te ?? magnaCarta.title.en,
    queue: builtTe.queue,
    preserveSegment: state.queue[state.currentIndex],
  });
  assert.equal(state.currentIndex, 3);
  assert.equal(state.queue[3].kind, 'explanation');
  assert.ok(state.queue[3].spokenText.includes('సులభ మరియు లోతైన వివరణ'));

  // Lookahead prefetch returns next 2 segments (Clause 40 headline + Clause 40 content)
  const lookahead = getLookaheadPrefetchSegments(state.queue, state.currentIndex, 2);
  assert.equal(lookahead.length, 2);
  assert.equal(lookahead[0].kind, 'headline');
  assert.equal(lookahead[1].kind, 'text');

  // Progress summary reports accurate position & next item
  const progress = getQueueProgressSummary(state);
  assert.equal(progress.position, 4);
  assert.equal(progress.total, 7);
  assert.equal(progress.hasPrev, true);
  assert.equal(progress.hasNext, true);
  assert.equal(progress.nextSegment?.clauseId, 'mc-c40');
});
