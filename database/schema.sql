-- =============================================================================
-- CONSTITUTION & LAW — UNIFIED "BOOKS & STRUCTURES" DATABASE SCHEMA
-- Single Source of Truth for Master Books, Multi-Language Editions,
-- Hierarchical Content (Constitutional Articles, General Law Sections,
-- Biography/General Sub-sections & Topics), 1-to-1 Manual Audio Attachments,
-- and Incremental Offline Delta-Sync.
-- Compatible with PostgreSQL 15+ (Relational Backend) and mirrored in
-- Firestore / JSON storage for offline-first Mobile + CMS apps.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ENUMERATIONS (Flexible Book Types & Strict 1-to-1 Audio Roles)
-- -----------------------------------------------------------------------------
CREATE TYPE book_structure_type AS ENUM (
  'constitutional',   -- Chapters/Parts -> Articles (Title, Definition, Deep Explanation, Examples)
  'general_law',      -- Chapters       -> Sections (Title, Purpose, Detailed Explanation, Case Examples)
  'biography'         -- Chapters       -> Sub-sections / Topics (Title, Content, Notes)
);

CREATE TYPE content_unit_type AS ENUM (
  'article',          -- Constitutional Books
  'section',          -- General Law Books
  'topic'             -- General / Biography Books (Sub-sections / Topics)
);

CREATE TYPE publication_status AS ENUM (
  'draft',
  'in_review',
  'published',
  'archived'
);

CREATE TYPE audio_entity_type AS ENUM (
  'edition',          -- Book Overview / Description audio
  'chapter',          -- Chapter Overview audio
  'legal_unit'        -- Article / Section / Topic block audio
);

CREATE TYPE audio_block_role AS ENUM (
  'book_description',
  'chapter_overview',
  'unit_definition',   -- Definition (Constitutional/Law) or Main Content (Biography)
  'unit_purpose',      -- Background / Purpose / Historical Context
  'unit_explanation',  -- Deep Explanation (Constitutional/Law) or Editorial Notes (Biography)
  'unit_examples',     -- Practical / Case Examples or Highlights
  'unit_full'          -- Full 1-to-1 narration for this Article / Section / Topic
);

-- -----------------------------------------------------------------------------
-- 2. MASTER BOOKS (Parent Grouping — Zero Auto-Translation)
--    Single parent record grouping manually authored language editions.
-- -----------------------------------------------------------------------------
CREATE TABLE master_books (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              VARCHAR(140) NOT NULL UNIQUE,
  book_type         book_structure_type NOT NULL,
  canonical_title   VARCHAR(240) NOT NULL,
  jurisdiction      VARCHAR(140) NOT NULL DEFAULT 'Republic of India',
  enactment_year    VARCHAR(32)  NOT NULL DEFAULT '1950',
  cover_image_url   TEXT,
  cover_tone        VARCHAR(32)  NOT NULL DEFAULT 'cobalt',
  version_number    INTEGER      NOT NULL DEFAULT 1,
  is_deleted        BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_master_books_type_active
  ON master_books (book_type, is_deleted)
  WHERE is_deleted = FALSE;

-- -----------------------------------------------------------------------------
-- 3. LANGUAGE EDITIONS (Manually Authored Per Language — Independent Text & Audio)
-- -----------------------------------------------------------------------------
CREATE TABLE book_editions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_book_id         UUID         NOT NULL REFERENCES master_books(id) ON DELETE CASCADE,
  language_code          VARCHAR(12)  NOT NULL,
  language_name          VARCHAR(64)  NOT NULL,
  native_language_name   VARCHAR(80)  NOT NULL,
  title                  VARCHAR(260) NOT NULL,
  subtitle               VARCHAR(400) NOT NULL DEFAULT '',
  description            TEXT         NOT NULL DEFAULT '',
  description_audio_url  TEXT,        -- 1-to-1 manually uploaded Book Overview audio
  cover_image_url        TEXT,
  narrator_name          VARCHAR(140) NOT NULL DEFAULT '',
  status                 publication_status NOT NULL DEFAULT 'draft',
  version_number         INTEGER      NOT NULL DEFAULT 1,
  is_deleted             BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_edition_master_language UNIQUE (master_book_id, language_code)
);

CREATE INDEX idx_book_editions_master_lang
  ON book_editions (master_book_id, language_code, is_deleted);
CREATE INDEX idx_book_editions_sync
  ON book_editions (id, version_number, updated_at);

-- -----------------------------------------------------------------------------
-- 4. CHAPTERS / PARTS (With 1-to-1 Chapter Overview Audio + Sync Versioning)
-- -----------------------------------------------------------------------------
CREATE TABLE chapters (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id           UUID         NOT NULL REFERENCES book_editions(id) ON DELETE CASCADE,
  chapter_order        INTEGER      NOT NULL DEFAULT 1,
  chapter_number       VARCHAR(80)  NOT NULL,
  title                VARCHAR(260) NOT NULL,
  overview_definition  TEXT         NOT NULL DEFAULT '',
  overview_audio_url   TEXT,        -- 1-to-1 manually uploaded Chapter Overview audio
  estimated_minutes    INTEGER      NOT NULL DEFAULT 5,
  version_number       INTEGER      NOT NULL DEFAULT 1,
  is_deleted           BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chapters_edition_order
  ON chapters (edition_id, chapter_order, is_deleted);
CREATE INDEX idx_chapters_sync
  ON chapters (edition_id, version_number, updated_at);

-- -----------------------------------------------------------------------------
-- 5. CONTENT UNITS (Articles, Sections, or Biography Sub-sections/Topics)
--    Every content block supports a strictly linked 1-to-1 manual audio file.
--
--    Field Mapping by book_structure_type:
--      constitutional ('article') : definition | purpose_background | deep_explanation | practical_examples
--      general_law    ('section') : definition | purpose_background (Why introduced) | deep_explanation | practical_examples (Case examples)
--      biography      ('topic')   : definition (Main Content) | purpose_background (Historical Context) | deep_explanation (Notes) | practical_examples (Key Highlights)
-- -----------------------------------------------------------------------------
CREATE TABLE content_units (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id            UUID              NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  edition_id            UUID              NOT NULL REFERENCES book_editions(id) ON DELETE CASCADE,
  unit_type             content_unit_type NOT NULL,
  unit_order            INTEGER           NOT NULL DEFAULT 1,
  unit_number           VARCHAR(80)       NOT NULL,
  title                 VARCHAR(260)      NOT NULL,
  definition            TEXT              NOT NULL DEFAULT '',
  purpose_background    TEXT              NOT NULL DEFAULT '',
  deep_explanation      TEXT              NOT NULL DEFAULT '',
  practical_examples    TEXT              NOT NULL DEFAULT '',

  -- Strictly 1-to-1 bound manually uploaded audio files (no AI TTS)
  definition_audio_url  TEXT,
  purpose_audio_url     TEXT,
  explanation_audio_url TEXT,
  examples_audio_url    TEXT,
  full_unit_audio_url   TEXT,
  audio_duration_sec    INTEGER           NOT NULL DEFAULT 0,

  -- Delta-Sync Tracking
  version_number        INTEGER           NOT NULL DEFAULT 1,
  is_deleted            BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_units_chapter_order
  ON content_units (chapter_id, unit_order, is_deleted);
CREATE INDEX idx_content_units_edition_sync
  ON content_units (edition_id, version_number, updated_at);

-- -----------------------------------------------------------------------------
-- 6. MANUAL AUDIO ASSETS REGISTRY (Direct Uploads Bound 1-to-1 to Content Nodes)
-- -----------------------------------------------------------------------------
CREATE TABLE audio_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type        audio_entity_type NOT NULL,
  entity_id          UUID              NOT NULL,
  block_role         audio_block_role  NOT NULL,
  original_filename  VARCHAR(260)      NOT NULL,
  storage_url        TEXT              NOT NULL,
  mime_type          VARCHAR(64)       NOT NULL DEFAULT 'audio/mpeg',
  byte_size          BIGINT            NOT NULL DEFAULT 0,
  duration_sec       INTEGER           NOT NULL DEFAULT 0,
  sha256_checksum    CHAR(64)          NOT NULL DEFAULT '',
  uploaded_by_uid    VARCHAR(128)      NOT NULL DEFAULT 'cms-admin',
  version_number     INTEGER           NOT NULL DEFAULT 1,
  is_deleted         BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_audio_entity_block UNIQUE (entity_type, entity_id, block_role)
);

CREATE INDEX idx_audio_assets_entity
  ON audio_assets (entity_type, entity_id, is_deleted);

-- -----------------------------------------------------------------------------
-- 7. SYNC CHANGE LOG & DEVICE OFFLINE SUBSCRIPTIONS (Delta-Sync Engine)
-- -----------------------------------------------------------------------------
CREATE TABLE sync_change_log (
  change_seq      BIGSERIAL    PRIMARY KEY,
  edition_id      UUID         NOT NULL REFERENCES book_editions(id) ON DELETE CASCADE,
  entity_type     VARCHAR(24)  NOT NULL, -- 'edition' | 'chapter' | 'content_unit' | 'audio_asset'
  entity_id       UUID         NOT NULL,
  operation       VARCHAR(16)  NOT NULL, -- 'INSERT' | 'UPDATE' | 'SOFT_DELETE'
  version_number  INTEGER      NOT NULL,
  changed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_change_log_edition_seq
  ON sync_change_log (edition_id, change_seq);

CREATE TABLE device_offline_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id               VARCHAR(140) NOT NULL,
  user_uid                VARCHAR(128),
  edition_id              UUID         NOT NULL REFERENCES book_editions(id) ON DELETE CASCADE,
  synced_edition_version  INTEGER      NOT NULL DEFAULT 1,
  chapter_versions_json   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  unit_versions_json      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_device_edition UNIQUE (device_id, edition_id)
);

-- -----------------------------------------------------------------------------
-- 8. AUTOMATIC VERSION BUMP & TIMESTAMP TRIGGERS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bump_version_and_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version_number := COALESCE(OLD.version_number, 0) + 1;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_master_books_version
  BEFORE UPDATE ON master_books
  FOR EACH ROW EXECUTE FUNCTION bump_version_and_timestamp();

CREATE TRIGGER trg_book_editions_version
  BEFORE UPDATE ON book_editions
  FOR EACH ROW EXECUTE FUNCTION bump_version_and_timestamp();

CREATE TRIGGER trg_chapters_version
  BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION bump_version_and_timestamp();

CREATE TRIGGER trg_content_units_version
  BEFORE UPDATE ON content_units
  FOR EACH ROW EXECUTE FUNCTION bump_version_and_timestamp();

CREATE TRIGGER trg_audio_assets_version
  BEFORE UPDATE ON audio_assets
  FOR EACH ROW EXECUTE FUNCTION bump_version_and_timestamp();
