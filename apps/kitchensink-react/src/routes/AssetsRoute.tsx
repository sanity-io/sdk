import {
  type AssetDocumentBase,
  useAssets,
  useDeleteAsset,
  useLinkMediaLibraryAsset,
  useUploadAsset,
} from '@sanity/sdk-react'
import {type JSX, useCallback, useMemo, useRef, useState} from 'react'

function AssetList({
  assets,
  onDelete,
}: {
  assets: AssetDocumentBase[]
  onDelete: (id: string) => void
}) {
  if (!assets.length) return <p>No assets</p>

  return (
    <ul
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
        padding: 0,
      }}
    >
      {assets.map((a) => (
        <li
          key={a._id}
          style={{listStyle: 'none', border: '1px solid #ddd', borderRadius: 6, padding: 8}}
        >
          <div style={{fontSize: 12, opacity: 0.6, marginBottom: 6}}>{a._type}</div>
          {a.url ? (
            <img
              src={a.url}
              alt={a.originalFilename ?? a._id}
              style={{width: '100%', height: 140, objectFit: 'cover', borderRadius: 4}}
            />
          ) : (
            <div
              style={{
                height: 140,
                display: 'grid',
                placeItems: 'center',
                background: '#fafafa',
                borderRadius: 4,
              }}
            >
              <span style={{fontSize: 12}}>{a.originalFilename ?? a._id}</span>
            </div>
          )}
          <div style={{display: 'flex', gap: 8, marginTop: 8, alignItems: 'center'}}>
            <a href={a.url ?? '#'} target="_blank" rel="noreferrer" style={{fontSize: 12}}>
              Open
            </a>
            <button onClick={() => onDelete(a._id)} style={{marginLeft: 'auto'}}>
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function AssetsRoute(): JSX.Element {
  // Query controls
  const [assetType, setAssetType] = useState<'all' | 'image' | 'file'>('all')
  const [order, setOrder] = useState<string>('_createdAt desc')
  const [limit, setLimit] = useState<number>(24)
  const options = useMemo(() => ({assetType, order, limit}), [assetType, order, limit])

  // Hooks
  const assets = useAssets(options)
  const upload = useUploadAsset()
  const remove = useDeleteAsset()
  const linkML = useLinkMediaLibraryAsset()

  // Upload handlers
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onSelectFile = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const f = ev.target.files?.[0]
      if (!f) return
      const kind = f.type.startsWith('image/') ? 'image' : 'file'
      if (kind === 'image') {
        await upload('image', f, {filename: f.name})
      } else {
        await upload('file', f, {filename: f.name})
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [upload],
  )

  const onDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this asset?')) return
      await remove(id)
    },
    [remove],
  )

  // Media Library link form
  const [mlAssetId, setMlAssetId] = useState('')
  const [mlId, setMlId] = useState('')
  const [mlInstId, setMlInstId] = useState('')
  const onLinkMl = useCallback(async () => {
    if (!mlAssetId || !mlId || !mlInstId) return
    await linkML({assetId: mlAssetId, mediaLibraryId: mlId, assetInstanceId: mlInstId})
    setMlAssetId('')
    setMlId('')
    setMlInstId('')
  }, [linkML, mlAssetId, mlId, mlInstId])

  return (
    <div style={{display: 'grid', gap: 16}}>
      <h1>Assets</h1>

      <section style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
        <label>
          Type
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as 'all' | 'image' | 'file')}
            style={{marginLeft: 8}}
          >
            <option value="all">All</option>
            <option value="image">Images</option>
            <option value="file">Files</option>
          </select>
        </label>
        <label>
          Order
          <input value={order} onChange={(e) => setOrder(e.target.value)} style={{marginLeft: 8}} />
        </label>
        <label>
          Limit
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value || '0', 10))}
            style={{marginLeft: 8, width: 80}}
          />
        </label>
        <label style={{marginLeft: 'auto'}}>
          Upload
          <input ref={fileInputRef} onChange={onSelectFile} type="file" style={{marginLeft: 8}} />
        </label>
      </section>

      <section>
        <h2 style={{marginTop: 0}}>Browse</h2>
        <AssetList assets={assets} onDelete={onDelete} />
      </section>

      <section>
        <h2 style={{marginTop: 0}}>Link Media Library Asset</h2>
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
          <input
            placeholder="assetId"
            value={mlAssetId}
            onChange={(e) => setMlAssetId(e.target.value)}
          />
          <input
            placeholder="mediaLibraryId"
            value={mlId}
            onChange={(e) => setMlId(e.target.value)}
          />
          <input
            placeholder="assetInstanceId"
            value={mlInstId}
            onChange={(e) => setMlInstId(e.target.value)}
          />
          <button onClick={onLinkMl}>Link</button>
        </div>
      </section>
    </div>
  )
}

export default AssetsRoute
