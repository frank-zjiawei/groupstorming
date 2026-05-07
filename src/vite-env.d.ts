/// <reference types="vite/client" />

declare module '*.txt?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY: string;
  readonly VITE_DEEPGRAM_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
