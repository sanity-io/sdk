---
'@sanity/sdk': minor
'@sanity/sdk-react': minor
---

Your `.groq` files now type your queries. `useQuery`, `getQueryState` and `resolveQuery` read the result and params types straight off a query imported through [`@sanity-labs/groq-content-mapper`](https://github.com/sanity-labs/groq-content-mapper): no generic to keep in sync, no registry entry, and params are checked too. This is experimental, and builds on `@sanity/client@8.11.0`.

Before, you either wrote the type yourself or registered the query:

```tsx
const {data} = useQuery<Movie | null>({query: '*[_type == "movie" && _id == $id][0]', params: {id}})
```

After:

```tsx
import movieById from './movieById.groq' with {type: 'text'}

const {data} = useQuery({query: movieById, params: {id}})
//     ^? Movie | null, and params that don't match the query are a type error
```

Plain strings, `defineQuery`, explicit generics, Typegen registrations and a query typed `any` resolve exactly as before. The brand carries no project or dataset and overrides the handle, like an explicit generic, so keep each dataset's `.groq` files in that dataset's `schemas` folder.
