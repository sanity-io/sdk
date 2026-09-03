// fallow-ignore-file unused-file -- reached only by tsconfig.shimcheck.json, which type
// checks the `groq` augmentation with `skipLibCheck` off.
// Imports `groq` so the augmentation in src/typegen/groqCompat.ts binds to it. Without an
// import of the target module TypeScript reports TS2664 and never checks the augmentation.
import {type SchemaOrigin} from 'groq'

export type Probe = SchemaOrigin<{brand: 1}, 'projectId.dataset'>
