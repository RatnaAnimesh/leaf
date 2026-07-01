use rusqlite::Connection;

pub fn setup(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            language TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            last_indexed_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS symbols (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            signature TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            start_byte INTEGER NOT NULL,
            end_byte INTEGER NOT NULL,
            enclosing_symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_symbol_id INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
            to_symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
            edge_type TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS unresolved_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_symbol_id INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
            to_symbol_name TEXT NOT NULL,
            edge_type TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
        CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
        CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_symbol_id);
        CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_symbol_id);
        CREATE INDEX IF NOT EXISTS idx_unresolved_name ON unresolved_edges(to_symbol_name);
        "#,
    )
}
