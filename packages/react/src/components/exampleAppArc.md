```tsx
<SanityApp>
  <SDKProvider>
    temporary? gets cleaned up?
    <ResourceProvider>
      <HandlerExecutor />
    </ResourceProvider>
    <PossiblyTheSameResourceProvider />
    <AnotherResourceProvider />
  </SDKProvider>
</SanityApp>
```

```ts
const navigateToSubtitleResource = () => {
  sendIntent({intentName: 'downloadSubtitles', documentId: `sfdsfsd`, documentType: })
}
```

```ts
const navigateToSubtitleResource = () => {
  sendIntent({documentId: `sfdsfsd`, documentType: `movie`, intentType: `view`})
}
```

```tsx
function Something() {
  return <SanityApp intentHandlerComponent={UserHandlerComponent} />
}

// // option 1: use your router's <Redirect /> component
// function UserHandlerComponent(props: SomeTypeGenedProps) {
//   if (props.intent.intentId === 'editSubtitle',) {
//     return <Redirect />
//   }
// }

// option 2: show a fallback "loading" screen and then call your router's navigate in an effect
function UserHandlerComponent(props: SomeTypeGenedProps) {
  const router = useRouter()

  useEffect(() => {
    if (props.intent.intentId) {
    }
    router.navigate()
  }, [])

  return <>Loading your intent…</>
}
```

```tsx
function SomeComponentThatDispatchesAnIntent(docHandle: DocumentHandle) {
  const intents = useIntents({
    // add params that you want to find
    // documentType: '...'
    ...docHandle,
    type: 'edit'
  })

  const dispatchIntent = useDispatchIntent()

  return <ul>{intents.map(({appId, intentName, intentId})) => <li>
  <button onClick={() => dispatchIntent({appId, intentName, ...docHandle})}>{intentName}</button>
  </li>}</ul>
}
```

```ts
// intent definition
{
  intentName: 'downloadSubtitles',
  intentType: 'view',
  ,
}
```

```tsx
<SanityApp>
  <SDKProvider>
    <ResourceProvider>
      <HandlerExecutor /> // listening to URL
    </ResourceProvider>
    <AnotherResourceProvider>
     <HandlerExecutor /> // listening to URL
    </AnotherResource>
  </SDKProvider>
</SanityApp>
```

```tsx
<SanityApp configs={[]}>
  {currentProjects.map((proj) => {
    ;<SDKProvider config={proj} />
  })}
</SanityApp>
```
