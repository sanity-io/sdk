/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SANITY_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
