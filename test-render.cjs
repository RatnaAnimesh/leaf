const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { TypeScript } = require('seti-icons-react');

console.log(ReactDOMServer.renderToStaticMarkup(React.createElement(TypeScript, { theme: 'extension/.ts', render: 'svg' })));
