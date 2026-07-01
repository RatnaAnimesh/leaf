use rusqlite::{Connection, OptionalExtension};

pub fn select_context(
    conn: &Connection,
    target_path: &str,
    anchor_line: usize,
) -> anyhow::Result<Vec<String>> {
    // We implement the 5-step contextual extraction algorithm from the spec

    // 1. Anchor resolution
    let file_id: Option<i64> = conn.query_row(
        "SELECT id FROM files WHERE path = ?1",
        [target_path],
        |row| row.get(0),
    ).optional()?;

    let file_id = match file_id {
        Some(id) => id,
        None => return Ok(Vec::new()),
    };

    // Find the tightest enclosing symbol around `anchor_line`
    let anchor_symbol: Option<(i64, String, String)> = conn.query_row(
        r#"
        SELECT id, name, signature
        FROM symbols
        WHERE file_id = ?1 AND start_line <= ?2 AND end_line >= ?2
        ORDER BY (end_line - start_line) ASC
        LIMIT 1
        "#,
        (file_id, anchor_line),
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional()?;

    let mut context_snippets = Vec::new();
    let mut total_tokens = 0; // Estimated as characters / 4
    let token_budget = 6000;

    let mut include_snippet = |signature: &str| {
        let tokens = signature.len() / 4;
        if total_tokens + tokens <= token_budget {
            context_snippets.push(signature.to_string());
            total_tokens += tokens;
        }
    };

    if let Some((anchor_id, _name, ref signature)) = anchor_symbol {
        include_snippet(signature);

        // 2. Caller / Callee hops (1 hop)
        
        // Callees (what does anchor call?)
        let mut stmt = conn.prepare(
            r#"
            SELECT to_symbol.signature
            FROM edges
            JOIN symbols AS to_symbol ON edges.to_symbol_id = to_symbol.id
            WHERE edges.from_symbol_id = ?1 AND edges.edge_type = 'calls'
            "#
        )?;
        let callee_iter = stmt.query_map([anchor_id], |row| row.get::<_, String>(0))?;
        for callee in callee_iter.flatten() {
            include_snippet(&callee);
        }

        // Callers (who calls anchor?)
        let mut stmt = conn.prepare(
            r#"
            SELECT from_symbol.signature
            FROM edges
            JOIN symbols AS from_symbol ON edges.from_symbol_id = from_symbol.id
            WHERE edges.to_symbol_id = ?1 AND edges.edge_type = 'calls'
            "#
        )?;
        let caller_iter = stmt.query_map([anchor_id], |row| row.get::<_, String>(0))?;
        for caller in caller_iter.flatten() {
            include_snippet(&caller);
        }

        // 3. Type references
        // Very basic regex name extraction for now...
        let words: Vec<&str> = signature.split(|c: char| !c.is_alphanumeric() && c != '_').filter(|w| !w.is_empty()).collect();
        for word in words {
            // Check if this word is a known type (class/struct)
            if let Ok(type_sig) = conn.query_row(
                "SELECT signature FROM symbols WHERE name = ?1 AND kind IN ('struct', 'class') LIMIT 1",
                [word],
                |row| row.get::<_, String>(0),
            ) {
                include_snippet(&type_sig);
            }
        }
    } else {
        // 4. Empty fallback (Same file sibling symbols & imports)
        let mut stmt = conn.prepare(
            "SELECT signature FROM symbols WHERE file_id = ?1 ORDER BY start_line ASC LIMIT 50"
        )?;
        let sibling_iter = stmt.query_map([file_id], |row| row.get::<_, String>(0))?;
        for sibling in sibling_iter.flatten() {
            include_snippet(&sibling);
        }
    }

    Ok(context_snippets)
}

