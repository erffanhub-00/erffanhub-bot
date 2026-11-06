CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_extension TEXT NOT NULL,
  category TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(file_name, content='files', content_rowid='id');

-- Keep the search index in sync: inserts into files do not update an
-- external-content FTS table on their own.
CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, file_name) VALUES (new.id, new.file_name);
END;

CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, file_name) VALUES ('delete', old.id, old.file_name);
END;

CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, file_name) VALUES ('delete', old.id, old.file_name);
  INSERT INTO files_fts(rowid, file_name) VALUES (new.id, new.file_name);
END;
