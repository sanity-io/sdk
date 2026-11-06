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

Plain strings, `defineQuery`, explicit generics and Typegen registrations resolve exactly as before.
