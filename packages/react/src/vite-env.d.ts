/// <reference types="vite/client" />
/// <reference types="vite/types/importMeta.d.ts" />

interface ImportMetaEnv {
  DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
