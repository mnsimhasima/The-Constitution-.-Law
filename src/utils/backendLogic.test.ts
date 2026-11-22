import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  canAccessSection,
  canCreateOrEditBook,
  canManageSettings,
  canManageSupportTickets,
  canManageUsersAndRoles,
  canPublishOrReviewBook,
  canRunBulkImport,
  canUnpublishOrDeleteBook,
  resolveUserRole,
} from './rbacLogic.ts';
import {
  parseBulkBooksCsv,
  parseBulkBooksJson,
  parseBulkBooksRows,
  SAMPLE_BULK_CSV,
  SAMPLE_BULK_JSON,
} from './bulkImportParser.ts';
import {
  COMMUNITY_OFF_TOPIC_ERROR,
  COMMUNITY_PROFANITY_ERROR,
  COMMUNITY_TEXT_ONLY_ERROR,
  validateCommunityPostTextLocally,
} from './communityModeration.ts';

describe('RBAC Authorization Matrix', () => {
  it('resolves bootstrapped admin email unconditionally as admin', () => {
    assert.equal(resolveUserRole(BOOTSTRAPPED_ADMIN_EMAIL, 'any-uid', []), 'admin');
    assert.equal(resolveUserRole('MNSIMHASIMA@GMAIL.COM', 'any-uid', []), 'admin');
  });

  it('resolves assigned active staff roles and ignores inactive roles', () => {
    const staff = [
      {
        uid: 'u-editor',
        email: 'editor@law.org',
        displayName: 'Editor One',
        role: 'editor' as const,
        assignedBy: BOOTSTRAPPED_ADMIN_EMAIL,
        active: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        uid: 'u-revoked',
        email: 'former@law.org',
        displayName: 'Former Reviewer',
        role: 'reviewer' as const,
        assignedBy: BOOTSTRAPPED_ADMIN_EMAIL,
        active: false,
        createdAt: '',
        updatedAt: '',
      },
    ];
    assert.equal(resolveUserRole('editor@law.org', 'u-editor', staff), 'editor');
    assert.equal(resolveUserRole('former@law.org', 'u-revoked', staff), 'user');
    assert.equal(resolveUserRole('reader@gmail.com', 'u-reader', staff), 'user');
  });

  it('enforces exact capabilities for Admin, Editor, Reviewer, and Security', () => {
    // Admin: multi-role full control
    assert.equal(canCreateOrEditBook('admin'), true);
    assert.equal(canRunBulkImport('admin'), true);
    assert.equal(canPublishOrReviewBook('admin'), true);
    assert.equal(canUnpublishOrDeleteBook('admin'), true);
    assert.equal(canManageUsersAndRoles('admin'), true);
    assert.equal(canManageSupportTickets('admin'), true);
    assert.equal(canManageSettings('admin'), true);

    // Editor: upload & edit content, bulk import, cannot publish or manage users/settings
    assert.equal(canCreateOrEditBook('editor'), true);
    assert.equal(canRunBulkImport('editor'), true);
    assert.equal(canPublishOrReviewBook('editor'), false);
    assert.equal(canManageUsersAndRoles('editor'), false);
    assert.equal(canManageSettings('editor'), false);
    assert.equal(canAccessSection('editor', 'bulk-import'), true);
    assert.equal(canAccessSection('editor', 'users-roles'), false);

    // Reviewer: read/listen & approve/publish, cannot bulk import or edit settings
    assert.equal(canPublishOrReviewBook('reviewer'), true);
    assert.equal(canCreateOrEditBook('reviewer'), false);
    assert.equal(canRunBulkImport('reviewer'), false);
    assert.equal(canAccessSection('reviewer', 'review-queue'), true);
    assert.equal(canAccessSection('reviewer', 'audio'), true);
    assert.equal(canAccessSection('reviewer', 'settings'), false);

    // Security: monitor users & manage support tickets + community moderation
    assert.equal(canManageSupportTickets('security'), true);
    assert.equal(canAccessSection('security', 'security-support'), true);
    assert.equal(canAccessSection('security', 'community-mod'), true);
    assert.equal(canPublishOrReviewBook('security'), false);
    assert.equal(canCreateOrEditBook('security'), false);
  });
});

describe('Bulk Book Import Parser (JSON, CSV, Excel rows)', () => {
  const actor = { uid: 'staff-1', email: 'editor@law.org' };

  it('parses the sample bulk JSON cleanly into a valid CmsBook', () => {
    const result = parseBulkBooksJson(SAMPLE_BULK_JSON, actor);
    assert.equal(result.errors.length, 0);
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].id, 'rti-act-2005');
    assert.equal(result.books[0].status, 'pending_review');
    assert.equal(result.books[0].chapters[0].clauses[0].number, 'Section 3');
    assert.ok(result.books[0].title.te?.includes('సమాచార హక్కు'));
  });

  it('parses the sample bulk CSV cleanly and handles quoted commas', () => {
    const result = parseBulkBooksCsv(SAMPLE_BULK_CSV, actor);
    assert.equal(result.errors.length, 0);
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].id, 'consumer-protection-2019');
    assert.equal(result.books[0].category, 'statutory');
    assert.equal(result.books[0].chapters[0].clauses.length, 1);
  });

  it('groups multiple Excel matrix rows for the same book into chapters & clauses', () => {
    const excelMatrix = [
      ['book_id', 'title_en', 'chapter_title_en', 'clause_number', 'clause_text_en', 'explanation_en'],
      [
        'civic-charter',
        'Civic Charter of Rights',
        'Fundamental Duties',
        'Clause 1',
        'Every citizen shall protect public institutions and constitutional harmony.',
        'Encourages everyday civic responsibility and respect for equal rights.',
      ],
      [
        'civic-charter',
        'Civic Charter of Rights',
        'Fundamental Duties',
        'Clause 2',
        'Every citizen shall promote scientific temper, humanism, and the spirit of inquiry.',
        'Calls for evidence-based reasoning and compassion in public life.',
      ],
    ];
    const result = parseBulkBooksRows(excelMatrix, actor);
    assert.equal(result.errors.length, 0);
    assert.equal(result.books.length, 1);
    assert.equal(result.books[0].chapters.length, 1);
    assert.equal(result.books[0].chapters[0].clauses.length, 2);
  });

  it('reports clear validation errors on malformed JSON and missing CSV columns', () => {
    const badJson = parseBulkBooksJson('{ broken json', actor);
    assert.equal(badJson.books.length, 0);
    assert.ok(badJson.errors.length > 0);

    const badCsv = parseBulkBooksCsv('title_en,clause_text_en\nOnly Title,Short', actor);
    assert.equal(badCsv.books.length, 0);
    assert.ok(badCsv.errors[0].includes('chapter_title_en'));
  });
});

describe('Community Text-Only & Profanity Validation', () => {
  it('accepts clean constitutional discussion text', () => {
    const res = validateCommunityPostTextLocally(
      'Article 21 protects both life and personal dignity — how does privacy connect with it?'
    );
    assert.equal(res.valid, true);
    assert.equal(res.containsProfanity, false);
    assert.equal(res.isTextOnly, true);
  });

  it('rejects bad words / profanity', () => {
    const res = validateCommunityPostTextLocally('This law is total bullshit and stupid.');
    assert.equal(res.valid, false);
    assert.equal(res.containsProfanity, true);
    assert.equal(res.errorMessage, COMMUNITY_PROFANITY_ERROR);
  });

  it('rejects links and embedded HTML to enforce text-only posting', () => {
    const resUrl = validateCommunityPostTextLocally('Check this article at https://spam.example.com now!');
    assert.equal(resUrl.valid, false);
    assert.equal(resUrl.isTextOnly, false);
    assert.equal(resUrl.errorMessage, COMMUNITY_TEXT_ONLY_ERROR);

    const resHtml = validateCommunityPostTextLocally('Hello <img src="x" /> constitutional friends');
    assert.equal(resHtml.valid, false);
    assert.equal(resHtml.isTextOnly, false);
  });

  it('exports the exact user-specified off-topic error message', () => {
    assert.equal(
      COMMUNITY_OFF_TOPIC_ERROR,
      "This content is not related to this community, so you shouldn't post this."
    );
  });
});
