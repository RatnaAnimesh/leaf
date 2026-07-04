import {
  TypeScript,
  React as ReactIcon,
  JavaScript,
  HTML,
  CSS,
  SASS,
  LESS,
  Markdown,
  Rust,
  Python,
  YML,
  XML,
  JSON as JSONIcon,
  Vue,
  Go,
  Ruby,
  PHP,
  Java,
  Cpp,
  CSharp,
  C,
  Git,
  NPM,
  Docker,
  DB,
  Default,
  Shell,
  TSConfig,
  SVG as SVGIcon,
} from 'seti-icons-react';

interface FileIconProps {
  name: string;
  size?: number;
}

interface IconEntry {
  Icon: any;
  theme: string;
}

// Extension → Seti icon + the correct theme key
const EXT_MAP: Record<string, IconEntry> = {
  tsx:    { Icon: ReactIcon,  theme: 'extension/.tsx' },
  jsx:    { Icon: ReactIcon,  theme: 'extension/.jsx' },
  ts:     { Icon: TypeScript, theme: 'extension/.ts'  },
  mts:    { Icon: TypeScript, theme: 'extension/.ts'  },
  cts:    { Icon: TypeScript, theme: 'extension/.ts'  },
  js:     { Icon: JavaScript, theme: 'extension/.js'  },
  mjs:    { Icon: JavaScript, theme: 'extension/.js'  },
  cjs:    { Icon: JavaScript, theme: 'extension/.js'  },
  es:     { Icon: JavaScript, theme: 'extension/.es'  },
  es6:    { Icon: JavaScript, theme: 'extension/.es6' },
  html:   { Icon: HTML,       theme: 'extension/.html'},
  htm:    { Icon: HTML,       theme: 'extension/.html'},
  css:    { Icon: CSS,        theme: 'extension/.css' },
  scss:   { Icon: SASS,       theme: 'extension/.scss'},
  sass:   { Icon: SASS,       theme: 'extension/.sass'},
  less:   { Icon: LESS,       theme: 'extension/.less'},
  md:     { Icon: Markdown,   theme: 'extension/.md'  },
  markdown:{ Icon: Markdown,  theme: 'extension/.markdown'},
  rs:     { Icon: Rust,       theme: 'extension/.rs'  },
  py:     { Icon: Python,     theme: 'extension/.py'  },
  pyc:    { Icon: Python,     theme: 'extension/.py'  },
  yml:    { Icon: YML,        theme: 'extension/.yml' },
  yaml:   { Icon: YML,        theme: 'extension/.yaml'},
  xml:    { Icon: XML,        theme: 'extension/.xml' },
  json:   { Icon: JSONIcon,   theme: 'extension/.json'},
  vue:    { Icon: Vue,        theme: 'extension/.vue' },
  go:     { Icon: Go,         theme: 'default'        },
  rb:     { Icon: Ruby,       theme: 'extension/.rb'  },
  php:    { Icon: PHP,        theme: 'extension/.php' },
  java:   { Icon: Java,       theme: 'extension/.java'},
  kt:     { Icon: Java,       theme: 'extension/.java'},
  cpp:    { Icon: Cpp,        theme: 'extension/.cpp' },
  cc:     { Icon: Cpp,        theme: 'extension/.cc'  },
  cxx:    { Icon: Cpp,        theme: 'extension/.cxx' },
  hpp:    { Icon: Cpp,        theme: 'extension/.cpp' },
  cs:     { Icon: CSharp,     theme: 'extension/.cs'  },
  c:      { Icon: C,          theme: 'extension/.c'   },
  h:      { Icon: C,          theme: 'extension/.h'   },
  sh:     { Icon: Shell,      theme: 'extension/.sh'  },
  bash:   { Icon: Shell,      theme: 'extension/.sh'  },
  zsh:    { Icon: Shell,      theme: 'extension/.zsh' },
  sql:    { Icon: DB,         theme: 'extension/.sql' },
  db:     { Icon: DB,         theme: 'default'        },
  sqlite: { Icon: DB,         theme: 'default'        },
  svg:    { Icon: SVGIcon,    theme: 'extension/.svg' },
  toml:   { Icon: Default,    theme: 'default'        },
  ini:    { Icon: Default,    theme: 'default'        },
  conf:   { Icon: Default,    theme: 'default'        },
};

// Exact filename matches (highest priority)
const EXACT_MAP: Record<string, IconEntry> = {
  'tsconfig.json':       { Icon: TSConfig,   theme: 'file/tsconfig.json' },
  'tsconfig.node.json':  { Icon: TSConfig,   theme: 'file/tsconfig.json' },
  '.gitignore':          { Icon: Git,        theme: 'extension/.gitignore'},
  '.gitattributes':      { Icon: Git,        theme: 'extension/.gitattributes'},
  'package.json':        { Icon: NPM,        theme: 'default'            },
  'package-lock.json':   { Icon: NPM,        theme: 'default'            },
  'Cargo.toml':          { Icon: Rust,       theme: 'extension/.rs'      },
  'Cargo.lock':          { Icon: Rust,       theme: 'extension/.rs'      },
  'Dockerfile':          { Icon: Docker,     theme: 'default'            },
  'docker-compose.yml':  { Icon: Docker,     theme: 'default'            },
  'docker-compose.yaml': { Icon: Docker,     theme: 'default'            },
  'vite.config.ts':      { Icon: TypeScript, theme: 'extension/.ts'      },
  'vite.config.js':      { Icon: JavaScript, theme: 'extension/.js'      },
};

export function FileIcon({ name, size = 16 }: FileIconProps) {
  const exactMatch = EXACT_MAP[name];
  if (exactMatch) {
    const { Icon, theme } = exactMatch;
    return (
      <Icon
        theme={theme}
        width={size}
        height={size}
        render="svg"
      />
    );
  }

  const ext = name.split('.').pop()?.toLowerCase();
  if (ext) {
    const extMatch = EXT_MAP[ext];
    if (extMatch) {
      const { Icon, theme } = extMatch;
      return (
        <Icon
          theme={theme}
          width={size}
          height={size}
          render="svg"
        />
      );
    }
  }

  return (
    <Default
      theme="default"
      width={size}
      height={size}
      render="svg"
    />
  );
}
