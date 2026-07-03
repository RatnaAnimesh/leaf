import { 
  TypeScript, 
  JavaScript, 
  HTML, 
  JSON as JSONIcon, 
  CSS, 
  Markdown, 
  Git, 
  Default,
  React as ReactIcon,
  TSConfig
} from 'seti-icons-react';
import { SiVite } from 'react-icons/si';

interface FileIconProps {
  name: string;
  size?: number;
}

// Ensure SVGs render smoothly
const svgStyle = { display: 'block' };

export function FileIcon({ name, size = 16 }: FileIconProps) {
  const ext = name.split('.').pop()?.toLowerCase();
  
  if (name === 'vite.config.ts' || name === 'vite.config.js') {
    return <SiVite size={size} color="#646cff" style={svgStyle} />;
  }
  
  if (name === 'tsconfig.json' || name === 'tsconfig.node.json') {
    return <div style={{ width: size, height: size, ...svgStyle }}><TSConfig render="svg" /></div>;
  }

  if (name === '.gitignore' || name === '.gitattributes') {
    return <div style={{ width: size, height: size, ...svgStyle }}><Git render="svg" /></div>;
  }

  switch (ext) {
    case 'tsx':
      return <div style={{ width: size, height: size, ...svgStyle }}><ReactIcon render="svg" /></div>;
    case 'ts':
      return <div style={{ width: size, height: size, ...svgStyle }}><TypeScript render="svg" /></div>;
    case 'jsx':
      return <div style={{ width: size, height: size, ...svgStyle }}><ReactIcon render="svg" /></div>;
    case 'js':
      return <div style={{ width: size, height: size, ...svgStyle }}><JavaScript render="svg" /></div>;
    case 'html':
    case 'htm':
      return <div style={{ width: size, height: size, ...svgStyle }}><HTML render="svg" /></div>;
    case 'json':
      return <div style={{ width: size, height: size, ...svgStyle }}><JSONIcon render="svg" /></div>;
    case 'css':
      return <div style={{ width: size, height: size, ...svgStyle }}><CSS render="svg" /></div>;
    case 'md':
      return <div style={{ width: size, height: size, ...svgStyle }}><Markdown render="svg" /></div>;
    default:
      return <div style={{ width: size, height: size, ...svgStyle }}><Default render="svg" /></div>;
  }
}
