use tree_sitter::{Query, QueryCursor, StreamingIterator};

pub const PYTHON_FUNCTIONS_QUERY: &str = r#"
(function_definition
  name: (identifier) @function.name
  parameters: (parameters) @function.params
) @function.def

(class_definition
  name: (identifier) @class.name
  superclasses: (argument_list)? @class.bases
) @class.def

(call
  function: [
    (identifier) @call.name
    (attribute attribute: (identifier) @call.name)
  ]
) @call.expr

(import_statement
  name: (dotted_name) @import.path
)

(import_from_statement
  module_name: (dotted_name) @import.module
)
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
