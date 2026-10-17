-- INDEXING is the state between "archive stored" and "index written".
-- Previously the ingestion worker marked repositories READY the moment the
-- archive landed in object storage, so the UI offered to chat with code that
-- had not been indexed yet.
ALTER TYPE "RepositoryStatus" ADD VALUE 'INDEXING';

-- Dominant chunk language measured by the indexing stage.
ALTER TABLE "Repository" ADD COLUMN "language" TEXT;
