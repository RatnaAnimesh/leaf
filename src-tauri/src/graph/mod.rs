pub mod parser;
pub mod extract_rust;
pub mod extract_python;
pub mod schema;
pub mod context_select;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use rusqlite::{Connection, OptionalExtension};
use crate::graph::parser::{parse_source, rust_parser, python_parser};

pub fn index_file(
    conn: &Connection,
    path: &str,
    source: &str,
    language: &str,
) -> anyhow::Result<()> {
    // 1. Check content hash
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    let current_hash = hasher.finish().to_string();

    let existing_hash: Option<String> = conn
        .query_row("SELECT content_hash FROM files WHERE path = ?1", [path], |row| row.get(0))
        .optional()?;

    if let Some(hash) = existing_hash {
        if hash == current_hash {
            return Ok(()); // File has not changed
        }
    }

    // 2. Parse source
    let mut parser = match language {
        "rust" => rust_parser(),
        "python" => python_parser(),
        _ => return Ok(()), // Unsupported
    };

    let tree = match parse_source(&mut parser, source) {
        Some(t) => t,
        None => return Ok(()),
    };

    // 3. Extract symbols
    let ts_language = match language {
        "rust" => tree_sitter_rust::LANGUAGE.into(),
        "python" => tree_sitter_python::LANGUAGE.into(),
        _ => unreachable!(),
    };

    let (functions_query, run_query_fn) = match language {
        "rust" => (
            extract_rust::RUST_FUNCTIONS_QUERY,
            extract_rust::run_query as for<'a> fn(&'a str, &'a tree_sitter::Language, &'a tree_sitter::Tree, &'a str) -> Vec<std::collections::HashMap<String, tree_sitter::Node<'a>>>,
        ),
        "python" => (
            extract_python::PYTHON_FUNCTIONS_QUERY,
            extract_python::run_query as for<'a> fn(&'a str, &'a tree_sitter::Language, &'a tree_sitter::Tree, &'a str) -> Vec<std::collections::HashMap<String, tree_sitter::Node<'a>>>,
        ),
        _ => unreachable!(),
    };

    let matches = run_query_fn(functions_query, &ts_language, &tree, source);

    struct ExtractedSymbol {
        name: String,
        kind: String,
        signature: String,
        start_line: usize,
        end_line: usize,
        start_byte: usize,
        end_byte: usize,
    }

    struct ExtractedCall {
        caller_byte: usize,
        to_symbol_name: String,
    }

    let mut symbols: Vec<ExtractedSymbol> = Vec::new();
    let mut calls: Vec<ExtractedCall> = Vec::new();

    let node_text_fn = match language {
        "rust" => extract_rust::node_text,
        "python" => extract_python::node_text,
        _ => unreachable!(),
    };

    for m in matches {
        if let Some(def_node) = m.get("function.def").or(m.get("method.def")).or(m.get("struct.def")).or(m.get("trait.def")).or(m.get("class.def")) {
            let kind = if m.contains_key("function.def") { "function" }
            else if m.contains_key("method.def") { "method" }
            else if m.contains_key("struct.def") { "struct" }
            else if m.contains_key("trait.def") { "trait" }
            else { "class" };

            let name_node = m.get(&format!("{}.name", kind)).unwrap();
            
            symbols.push(ExtractedSymbol {
                name: node_text_fn(name_node, source).to_string(),
                kind: kind.to_string(),
                signature: node_text_fn(def_node, source).to_string(),
                start_line: def_node.start_position().row,
                end_line: def_node.end_position().row,
                start_byte: def_node.start_byte(),
                end_byte: def_node.end_byte(),
            });
        } else if let Some(call_node) = m.get("call.expr") {
            if let Some(name_node) = m.get("call.name") {
                calls.push(ExtractedCall {
                    caller_byte: call_node.start_byte(),
                    to_symbol_name: node_text_fn(name_node, source).to_string(),
                });
            }
        }
    }

    // Grouping nodes into structured symbols is complex and involves matching specific capture names
    // For now, we will just parse them into a basic structure to get the schema populated correctly
    // so we can implement the transaction.

    // 4. Update SQLite (unchecked_transaction)
    let tx = conn.unchecked_transaction()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Upsert file
    tx.execute(
        "INSERT INTO files (path, language, content_hash, last_indexed_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(path) DO UPDATE SET
            content_hash=excluded.content_hash,
            last_indexed_at=excluded.last_indexed_at",
        (path, language, &current_hash, now),
    )?;

    let file_id: i64 = tx.query_row("SELECT id FROM files WHERE path = ?1", [path], |row| row.get(0))?;

    // Delete existing symbols for this file (ON DELETE CASCADE removes edges)
    tx.execute("DELETE FROM symbols WHERE file_id = ?1", [file_id])?;

    // Sort symbols by start_byte for easy enclosing parent matching
    symbols.sort_by_key(|s| s.start_byte);
    
    // Maintain a map of start_byte -> DB id
    let mut db_ids: std::collections::HashMap<usize, i64> = std::collections::HashMap::new();

    let mut stmt = tx.prepare("INSERT INTO symbols (file_id, name, kind, signature, start_line, end_line, start_byte, end_byte, enclosing_symbol_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")?;
    for sym in &symbols {
        // Find parent: tightest symbol that encloses this one
        let parent = symbols.iter().rev().find(|p| p.start_byte <= sym.start_byte && p.end_byte >= sym.end_byte && p.start_byte != sym.start_byte);
        let parent_id = parent.and_then(|p| db_ids.get(&p.start_byte).copied());

        let id = stmt.insert(rusqlite::params![
            file_id,
            sym.name,
            sym.kind,
            sym.signature,
            sym.start_line,
            sym.end_line,
            sym.start_byte,
            sym.end_byte,
            parent_id
        ])?;
        db_ids.insert(sym.start_byte, id);
    }
    drop(stmt);

    let mut edges_stmt = tx.prepare("INSERT INTO unresolved_edges (from_symbol_id, to_symbol_name, edge_type) VALUES (?1, ?2, ?3)")?;
    for call in calls {
        // Find enclosing symbol for this call
        let caller = symbols.iter().rev().find(|p| p.start_byte <= call.caller_byte && p.end_byte >= call.caller_byte);
        if let Some(caller_sym) = caller {
            if let Some(&caller_id) = db_ids.get(&caller_sym.start_byte) {
                edges_stmt.execute(rusqlite::params![caller_id, call.to_symbol_name, "calls"])?;
            }
        }
    }
    drop(edges_stmt);
    
    // Resolve unresolved edges (where possible) within the transaction
    tx.execute(
        r#"
        INSERT INTO edges (from_symbol_id, to_symbol_id, edge_type)
        SELECT u.from_symbol_id, s.id, u.edge_type
        FROM unresolved_edges u
        JOIN symbols s ON u.to_symbol_name = s.name
        "#,
        [],
    )?;
    // Now delete those that were resolved
    tx.execute(
        r#"
        DELETE FROM unresolved_edges
        WHERE EXISTS (
            SELECT 1 FROM symbols s WHERE s.name = unresolved_edges.to_symbol_name
        )
        "#,
        [],
    )?;

    tx.commit()?;
    Ok(())
}
