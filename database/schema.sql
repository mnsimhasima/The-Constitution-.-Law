-- =============================================================================
-- CONSTITUTION & LAW — UNIFIED SUPABASE POSTGRESQL + S3 DATABASE SCHEMA
-- Single Source of Truth migrated from Firebase Firestore to Supabase:
--   1. master_books           (Parent grouping — Constitutional, General Law, Biography)
--   2. book_editions          (Manually authored language variants — zero auto-translation)
--   3. content_nodes          (Single unified hierarchical table for Chapters, Articles,
--                              Sections, and Sub-sections / Topics with inline versioning)
--   4. audio_assets           (Strict 1-to-1 manual audio uploads stored in Supabase S3)
--   5. content_audio_metadata (Per-node audio metadata linked 1-to-1 to S3 audio files)
--   6. Platform CMS & Reader tables (cms_books, audio_tracks, staff_roles, user_directory,
--      community_posts, support_tickets, audit_logs, sources_rights, system_settings,
--      user_profiles, user_notes, user_annotations, user_custom_books)
--
-- Legacy synchronization tables (sync_change_log, device_offline_subscriptions)
-- and split tables (chapters, content_units) have been removed.
-- Incremental offline Delta-Sync is powered directly by version_number,
-- updated_at, and is_deleted columns on master_books, book_editions, and
-- content_nodes.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Remove any legacy split or synchronization tables
DROP TABLE IF EXISTS sync_change_log CASCADE;
DROP TABLE IF EXISTS device_offline_subscriptions CASCADE;
DROP TABLE IF EXISTS content_units CASCADE;
DROP TABLE IF EXISTS chapters CASCADE;

-- -----------------------------------------------------------------------------
-- 1. ENUMERATIONS (Idempotent for Supabase SQL Editor / Migrations)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE book_structure_type AS ENUM ('constitutional', 'general_law', 'biography');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE content_node_type AS ENUM ('chapter', 'article', 'section', 'topic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE publication_status AS ENUM ('draft', 'in_review', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audio_entity_type AS ENUM ('edition', 'content_node', 'chapter', 'legal_unit', 'cms_clause');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audio_block_role AS ENUM (
    'book_description',
    'chapter_overview',
    'unit_definition',
    'unit_purpose',
    'unit_explanation',
    'unit_examples',
    'unit_full'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 2. MASTER BOOKS (Parent Book Grouping — No Auto-Translation)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_books (
  id                TEXT PRIMARY KEY,
  slug              VARCHAR(140)        NOT NULL UNIQUE,
  book_type         book_structure_type NOT NULL DEFAULT 'constitutional',
  canonical_title   VARCHAR(240)        NOT NULL,
  jurisdiction      VARCHAR(140)        NOT NULL DEFAULT 'Republic of India',
  enactment_year    VARCHAR(32)         NOT NULL DEFAULT '1950',
  cover_image_url   TEXT,
  cover_tone        VARCHAR(32)         NOT NULL DEFAULT 'cobalt',
  glossary_json     JSONB               NOT NULL DEFAULT '[]'::jsonb,

  -- Inline Sync & Versioning Metadata
  version_number    INTEGER             NOT NULL DEFAULT 1,
  is_deleted        BOOLEAN             NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_books_type_active
  ON master_books (book_type, is_deleted)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_master_books_sync
  ON master_books (id, version_number, updated_at);

-- -----------------------------------------------------------------------------
-- 3. BOOK EDITIONS (Manually Authored Language Variants — Independent Text & Audio)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_editions (
  id                     TEXT PRIMARY KEY,
  master_book_id         TEXT               NOT NULL REFERENCES master_books(id) ON DELETE CASCADE,
  language_code          VARCHAR(12)        NOT NULL,
  language_name          VARCHAR(64)        NOT NULL,
  native_language_name   VARCHAR(80)        NOT NULL,
  title                  VARCHAR(260)       NOT NULL,
  subtitle               VARCHAR(400)       NOT NULL DEFAULT '',
  description            TEXT               NOT NULL DEFAULT '',
  description_audio_url  TEXT,              -- 1-to-1 Supabase S3 Book Overview audio URL
  cover_image_url        TEXT,
  narrator_name          VARCHAR(140)       NOT NULL DEFAULT '',
  status                 publication_status NOT NULL DEFAULT 'published',

  -- Inline Sync & Versioning Metadata
  version_number         INTEGER            NOT NULL DEFAULT 1,
  is_deleted             BOOLEAN            NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_book_edition_master_language UNIQUE (master_book_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_book_editions_master_lang
  ON book_editions (master_book_id, language_code, is_deleted);

CREATE INDEX IF NOT EXISTS idx_book_editions_sync
  ON book_editions (id, version_number, updated_at);

-- -----------------------------------------------------------------------------
-- 4. CONTENT NODES (Single Unified Hierarchical Table)
--    Handles Chapters, Articles, Sections, and Biography Sub-sections / Topics
--    with inline sync versioning and strict 1-to-1 Supabase S3 audio URLs.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_nodes (
  id                     TEXT PRIMARY KEY,
  edition_id             TEXT              NOT NULL REFERENCES book_editions(id) ON DELETE CASCADE,
  parent_node_id         TEXT              REFERENCES content_nodes(id) ON DELETE CASCADE,
  node_type              content_node_type NOT NULL,
  node_order             INTEGER           NOT NULL DEFAULT 1,
  node_number            VARCHAR(80)       NOT NULL,
  title                  VARCHAR(260)      NOT NULL,

  -- Structured Text Blocks
  definition             TEXT              NOT NULL DEFAULT '',
  purpose_background     TEXT              NOT NULL DEFAULT '',
  deep_explanation       TEXT              NOT NULL DEFAULT '',
  practical_examples     TEXT              NOT NULL DEFAULT '',
  estimated_minutes      INTEGER           NOT NULL DEFAULT 5,

  -- Strictly 1-to-1 Bound Supabase S3 Manual Audio URLs (Zero AI TTS)
  overview_audio_url     TEXT,
  definition_audio_url   TEXT,
  purpose_audio_url      TEXT,
  explanation_audio_url  TEXT,
  examples_audio_url     TEXT,
  full_audio_url         TEXT,
  audio_duration_sec     INTEGER           NOT NULL DEFAULT 0,

  -- Inline Sync & Versioning Metadata (Direct Delta-Sync)
  version_number         INTEGER           NOT NULL DEFAULT 1,
  is_deleted             BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_content_node_hierarchy CHECK (
    (node_type = 'chapter' AND parent_node_id IS NULL)
    OR (node_type IN ('article', 'section', 'topic') AND parent_node_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_content_nodes_edition_parent_order
  ON content_nodes (edition_id, parent_node_id, node_order, is_deleted);

CREATE INDEX IF NOT EXISTS idx_content_nodes_edition_type
  ON content_nodes (edition_id, node_type, is_deleted);

CREATE INDEX IF NOT EXISTS idx_content_nodes_delta_sync
  ON content_nodes (edition_id, version_number, updated_at, is_deleted);

-- -----------------------------------------------------------------------------
-- 5. SUPABASE S3 AUDIO ASSETS REGISTRY (1-to-1 Direct File Uploads)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audio_assets (
  id                 TEXT PRIMARY KEY,
  entity_type        audio_entity_type NOT NULL,
  entity_id          TEXT              NOT NULL,
  block_role         audio_block_role  NOT NULL,
  original_filename  VARCHAR(260)      NOT NULL,
  s3_bucket          VARCHAR(140)      NOT NULL DEFAULT 'Constitution Files',
  s3_key             TEXT              NOT NULL DEFAULT '',
  storage_url        TEXT              NOT NULL,
  public_url         TEXT              NOT NULL DEFAULT '',
  mime_type          VARCHAR(64)       NOT NULL DEFAULT 'audio/wav',
  byte_size          BIGINT            NOT NULL DEFAULT 0,
  duration_sec       INTEGER           NOT NULL DEFAULT 0,
  sha256_checksum    VARCHAR(128)      NOT NULL DEFAULT '',
  uploaded_by_uid    VARCHAR(128)      NOT NULL DEFAULT 'cms-admin',
  version_number     INTEGER           NOT NULL DEFAULT 1,
  is_deleted         BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audio_assets_entity
  ON audio_assets (entity_type, entity_id, is_deleted);

-- -----------------------------------------------------------------------------
-- 6. PER-NODE CONTENT AUDIO METADATA (Replaces Firestore contentAudioMetadata)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_audio_metadata (
  id                  TEXT PRIMARY KEY,
  content_source      VARCHAR(32)  NOT NULL DEFAULT 'books_structures',
  book_id             TEXT         NOT NULL,
  book_title          VARCHAR(160) NOT NULL,
  edition_id          TEXT         NOT NULL DEFAULT '',
  chapter_id          TEXT         NOT NULL,
  chapter_title       VARCHAR(160) NOT NULL,
  content_node_id     TEXT         NOT NULL,
  content_node_type   VARCHAR(24)  NOT NULL,
  content_node_number VARCHAR(60)  NOT NULL,
  content_node_title  VARCHAR(160) NOT NULL,
  block_role          VARCHAR(24)  NOT NULL,
  language            VARCHAR(12)  NOT NULL DEFAULT 'en',
  narrator            VARCHAR(120) NOT NULL DEFAULT 'Studio Narrator',
  file_name           VARCHAR(200) NOT NULL,
  mime_type           VARCHAR(64)  NOT NULL,
  byte_size           BIGINT       NOT NULL DEFAULT 0,
  duration_sec        INTEGER      NOT NULL DEFAULT 0,
  duration_label      VARCHAR(32)  NOT NULL DEFAULT '00:00',
  audio_url           TEXT         NOT NULL,
  asset_id            TEXT         NOT NULL DEFAULT '',
  sha256_checksum     VARCHAR(128) NOT NULL DEFAULT '',
  status              VARCHAR(24)  NOT NULL DEFAULT 'published',
  uploaded_by_uid     VARCHAR(128) NOT NULL DEFAULT 'cms-admin',
  uploaded_by_email   VARCHAR(180) NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_audio_metadata_node
  ON content_audio_metadata (content_node_id, block_role, language);

-- -----------------------------------------------------------------------------
-- 7. CMS & OPERATIONS TABLES (Migrated from Firestore Collections to Supabase)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cms_books (
  id                 TEXT PRIMARY KEY,
  short_title        VARCHAR(120) NOT NULL,
  title              JSONB        NOT NULL DEFAULT '{}'::jsonb,
  subtitle           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  jurisdiction       VARCHAR(140) NOT NULL DEFAULT 'Republic of India',
  year               VARCHAR(32)  NOT NULL DEFAULT '1950',
  category           VARCHAR(32)  NOT NULL DEFAULT 'constitutions',
  cover_tone         VARCHAR(32)  NOT NULL DEFAULT 'cobalt',
  cover_image        TEXT,
  status             VARCHAR(32)  NOT NULL DEFAULT 'published',
  source_attribution TEXT         NOT NULL DEFAULT '',
  rights_license     VARCHAR(160) NOT NULL DEFAULT '',
  chapters           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_by_uid     VARCHAR(128) NOT NULL DEFAULT 'seed-admin',
  created_by_email   VARCHAR(180) NOT NULL DEFAULT '',
  reviewed_by_email  VARCHAR(180) NOT NULL DEFAULT '',
  review_notes       TEXT         NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audio_tracks (
  id                TEXT PRIMARY KEY,
  book_id           TEXT         NOT NULL,
  book_title        VARCHAR(160) NOT NULL,
  chapter_id        TEXT         NOT NULL,
  chapter_title     VARCHAR(160) NOT NULL,
  language          VARCHAR(12)  NOT NULL DEFAULT 'en',
  narrator          VARCHAR(120) NOT NULL DEFAULT '',
  duration_label    VARCHAR(32)  NOT NULL DEFAULT '00:00',
  audio_url         TEXT         NOT NULL DEFAULT '',
  status            VARCHAR(24)  NOT NULL DEFAULT 'published',
  uploaded_by_uid   VARCHAR(128) NOT NULL DEFAULT 'seed-admin',
  uploaded_by_email VARCHAR(180) NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_roles (
  uid          TEXT PRIMARY KEY,
  email        VARCHAR(180) NOT NULL,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  role         VARCHAR(24)  NOT NULL DEFAULT 'editor',
  assigned_by  VARCHAR(180) NOT NULL DEFAULT '',
  active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_directory (
  uid           TEXT PRIMARY KEY,
  display_name  VARCHAR(120) NOT NULL DEFAULT '',
  email         VARCHAR(180) NOT NULL,
  photo_url     TEXT         NOT NULL DEFAULT '',
  provider      VARCHAR(60)  NOT NULL DEFAULT 'google.com',
  role          VARCHAR(24)  NOT NULL DEFAULT 'user',
  status        VARCHAR(24)  NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_posts (
  id                TEXT PRIMARY KEY,
  author_id         VARCHAR(128) NOT NULL,
  author_name       VARCHAR(120) NOT NULL,
  author_handle     VARCHAR(80)  NOT NULL DEFAULT '',
  author_initials   VARCHAR(8)   NOT NULL DEFAULT 'U',
  author_tone       VARCHAR(40)  NOT NULL DEFAULT 'bg-blue-600',
  tag               VARCHAR(60)  NOT NULL DEFAULT 'Constitutional Law',
  content           TEXT         NOT NULL,
  book_id           TEXT         NOT NULL DEFAULT '',
  chapter_id        TEXT         NOT NULL DEFAULT '',
  likes_count       INTEGER      NOT NULL DEFAULT 0,
  moderation_status VARCHAR(24)  NOT NULL DEFAULT 'approved',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id              TEXT PRIMARY KEY,
  user_id         VARCHAR(128) NOT NULL,
  user_email      VARCHAR(180) NOT NULL DEFAULT '',
  user_name       VARCHAR(120) NOT NULL DEFAULT '',
  category        VARCHAR(24)  NOT NULL DEFAULT 'other',
  subject         VARCHAR(160) NOT NULL,
  description     TEXT         NOT NULL,
  status          VARCHAR(24)  NOT NULL DEFAULT 'open',
  priority        VARCHAR(24)  NOT NULL DEFAULT 'medium',
  assigned_to     VARCHAR(180) NOT NULL DEFAULT '',
  resolution_note TEXT         NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  actor_uid   VARCHAR(128) NOT NULL,
  actor_email VARCHAR(180) NOT NULL DEFAULT '',
  actor_role  VARCHAR(24)  NOT NULL DEFAULT 'admin',
  action      VARCHAR(80)  NOT NULL,
  target_type VARCHAR(60)  NOT NULL,
  target_id   TEXT         NOT NULL,
  summary     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sources_rights (
  id           TEXT PRIMARY KEY,
  book_id      TEXT         NOT NULL,
  book_title   VARCHAR(160) NOT NULL,
  source_name  VARCHAR(200) NOT NULL,
  license_type VARCHAR(120) NOT NULL,
  jurisdiction VARCHAR(120) NOT NULL,
  citation_url TEXT         NOT NULL DEFAULT '',
  verified     BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_by   VARCHAR(180) NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id                           TEXT PRIMARY KEY,
  require_review_before_publish BOOLEAN     NOT NULL DEFAULT TRUE,
  strict_community_moderation   BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_csv_import              BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_json_import             BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_excel_import            BOOLEAN     NOT NULL DEFAULT TRUE,
  default_language              VARCHAR(12) NOT NULL DEFAULT 'en',
  updated_by                    VARCHAR(180) NOT NULL DEFAULT '',
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8. READER PRIVATE SYNC TABLES (Migrated from Firestore /users/{uid}/*)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  uid                    TEXT PRIMARY KEY,
  display_name           VARCHAR(120) NOT NULL DEFAULT '',
  email                  VARCHAR(180) NOT NULL DEFAULT '',
  photo_url              TEXT         NOT NULL DEFAULT '',
  preferred_language     VARCHAR(12)  NOT NULL DEFAULT 'en',
  streak_days            INTEGER      NOT NULL DEFAULT 1,
  audio_minutes          INTEGER      NOT NULL DEFAULT 0,
  started_plan_ids       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  completed_plan_day_ids JSONB        NOT NULL DEFAULT '[]'::jsonb,
  read_chapter_ids       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_notes (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT         NOT NULL,
  clause_key  VARCHAR(160) NOT NULL,
  book_id     VARCHAR(128) NOT NULL,
  chapter_id  VARCHAR(128) NOT NULL,
  clause_id   VARCHAR(128) NOT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notes_owner
  ON user_notes (owner_id, clause_key);

CREATE TABLE IF NOT EXISTS user_annotations (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT         NOT NULL,
  clause_key  VARCHAR(160) NOT NULL,
  book_id     VARCHAR(128) NOT NULL,
  chapter_id  VARCHAR(128) NOT NULL,
  clause_id   VARCHAR(128) NOT NULL,
  kind        VARCHAR(24)  NOT NULL,
  color       VARCHAR(24)  NOT NULL DEFAULT 'none',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_annotations_owner
  ON user_annotations (owner_id, kind);

CREATE TABLE IF NOT EXISTS user_custom_books (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT         NOT NULL,
  short_title      VARCHAR(120) NOT NULL,
  title_en         VARCHAR(200) NOT NULL,
  jurisdiction     VARCHAR(140) NOT NULL DEFAULT 'Republic of India',
  year             VARCHAR(32)  NOT NULL DEFAULT '2026',
  category         VARCHAR(32)  NOT NULL DEFAULT 'custom',
  chapter_title_en VARCHAR(200) NOT NULL,
  clause_number    VARCHAR(80)  NOT NULL,
  principle_en     VARCHAR(160) NOT NULL DEFAULT '',
  clause_text_en   TEXT         NOT NULL,
  explanation_en   TEXT         NOT NULL,
  clause_text_te   TEXT         NOT NULL DEFAULT '',
  explanation_te   TEXT         NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_custom_books_owner
  ON user_custom_books (owner_id);

-- -----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (Public read for published catalog; server service_role writes)
-- -----------------------------------------------------------------------------
ALTER TABLE master_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_audio_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources_rights ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_custom_books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_master_books" ON master_books;
CREATE POLICY "public_read_master_books" ON master_books
  FOR SELECT USING (is_deleted = FALSE);

DROP POLICY IF EXISTS "public_read_book_editions" ON book_editions;
CREATE POLICY "public_read_book_editions" ON book_editions
  FOR SELECT USING (is_deleted = FALSE AND status = 'published');

DROP POLICY IF EXISTS "public_read_content_nodes" ON content_nodes;
CREATE POLICY "public_read_content_nodes" ON content_nodes
  FOR SELECT USING (is_deleted = FALSE);

DROP POLICY IF EXISTS "public_read_audio_assets" ON audio_assets;
CREATE POLICY "public_read_audio_assets" ON audio_assets
  FOR SELECT USING (is_deleted = FALSE);

DROP POLICY IF EXISTS "public_read_content_audio_metadata" ON content_audio_metadata;
CREATE POLICY "public_read_content_audio_metadata" ON content_audio_metadata
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "public_read_cms_books" ON cms_books;
CREATE POLICY "public_read_cms_books" ON cms_books
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "public_read_community_posts" ON community_posts;
CREATE POLICY "public_read_community_posts" ON community_posts
  FOR SELECT USING (moderation_status = 'approved');
