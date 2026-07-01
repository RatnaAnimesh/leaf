use tree_sitter::Parser;

pub fn rust_parser() -> Parser {
    let mut parser = Parser::new();
    parser
        .set_language(&tree_sitter_rust::LANGUAGE.into())
        .expect("failed to load Rust grammar");
    parser
}

pub fn python_parser() -> Parser {
    let mut parser = Parser::new();
    parser
        .set_language(&tree_sitter_python::LANGUAGE.into())
        .expect("failed to load Python grammar");
    parser
}

pub fn parse_source(parser: &mut Parser, source: &str) -> Option<tree_sitter::Tree> {
    parser.parse(source, None)
}
