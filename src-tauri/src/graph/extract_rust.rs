use tree_sitter::{Query, QueryCursor, StreamingIterator};

pub const RUST_FUNCTIONS_QUERY: &str = r#"
(function_item
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  return_type: (_)? @function.return_type
) @function.def

(impl_item
  type: (type_identifier) @impl.type
  body: (declaration_list
    (function_item
      name: (identifier) @method.name
    ) @method.def
  )
) @impl.def

(struct_item
  name: (type_identifier) @struct.name
) @struct.def

(trait_item
  name: (type_identifier) @trait.name
) @trait.def

(call_expression
  function: [
    (identifier) @call.name
    (field_expression field: (field_identifier) @call.name)
  ]
) @call.expr

(use_declaration
  argument: (_) @import.path
) @import.decl
"#;

pub fn run_query<'a>(
    query_str: &str,
    language: &tree_sitter::Language,
    tree: &'a tree_sitter::Tree,
    source: &'a str,
) -> Vec<std::collections::HashMap<String, tree_sitter::Node<'a>>> {
    let query = Query::new(language, query_str).expect("invalid query — this is a bug in the query string, not user input");
    let mut cursor = QueryCursor::new();
    let mut results = Vec::new();

    let mut matches_iter = cursor.matches(&query, tree.root_node(), source.as_bytes());
    while let Some(m) = matches_iter.next() {
        let mut capture_map = std::collections::HashMap::new();
        for capture in m.captures {
            let capture_name = query.capture_names()[capture.index as usize].to_string();
            capture_map.insert(capture_name, capture.node);
        }
        results.push(capture_map);
    }
    results
}

pub fn node_text<'a>(node: &tree_sitter::Node, source: &'a str) -> &'a str {
    &source[node.start_byte()..node.end_byte()]
}
