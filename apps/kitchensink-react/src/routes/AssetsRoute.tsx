import {
  type AssetDocumentBase,
  createAssetHandle,
  useAssets,
  useDeleteAsset,
  useLinkMediaLibraryAsset,
  useUploadAsset,
} from '@sanity/sdk-react'
import {Button, Card, Flex, Label, Stack, Text} from '@sanity/ui'
import {type JSX, useCallback, useEffect, useMemo, useRef, useState} from 'react'

import {DocumentGridLayout} from '../components/DocumentGridLayout/DocumentGridLayout'
import {PageLayout} from '../components/PageLayout'

function AssetList({
  assets,
  onDelete,
}: {
  assets: AssetDocumentBase[]
  onDelete: (id: string) => void
}) {
  if (!assets.length)
    return (
      <Card padding={4} radius={2} tone="inherit">
        <Stack space={3}>
          <Text weight="semibold">No assets</Text>
          <Text muted size={1}>
            Upload a file to get started.
          </Text>
        </Stack>
      </Card>
    )

  return (
    <DocumentGridLayout>
      {assets.map((a) => (
        <li key={a._id}>
          <Card padding={3} radius={2} tone="inherit" style={{height: '100%'}}>
            <Stack space={3}>
              <Text size={1} muted>
                {a._type}
              </Text>
              {a.url ? (
                <img
                  src={a.url}
                  alt={a.originalFilename ?? a._id}
                  style={{width: '100%', height: 180, objectFit: 'cover', borderRadius: 4}}
                />
              ) : (
                <Card
                  padding={3}
                  radius={2}
                  style={{height: 180, display: 'grid', placeItems: 'center'}}
                >
                  <Text size={1} muted>
                    {a.originalFilename ?? a._id}
                  </Text>
                </Card>
              )}
              <Text size={1} style={{wordBreak: 'break-word'}}>
                {a.originalFilename ?? a._id}
              </Text>
              <Flex gap={2} align="center">
                <Button
                  as="a"
                  href={a.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  text="Open"
                  mode="bleed"
                />
                <Flex style={{marginLeft: 'auto'}}>
                  <Button tone="critical" text="Delete" onClick={() => onDelete(a._id)} />
                </Flex>
              </Flex>
            </Stack>
          </Card>
        </li>
      ))}
    </DocumentGridLayout>
  )
}

export function AssetsRoute(): JSX.Element {
  // Query controls
  const [assetType, setAssetType] = useState<'all' | 'image' | 'file'>('all')
  const [order, setOrder] = useState<string>('_createdAt desc')
  const [limit, setLimit] = useState<number>(24)
  // Bump this to force a re-fetch of assets
  const [refresh, setRefresh] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const requeryTimeoutsRef = useRef<number[]>([])
  const options = useMemo(
    () => ({
      assetType,
      order,
      limit,
      params: {refresh}, // add refresh to params to cache bust
      projectId: 'vo1ysemo',
      dataset: 'production',
    }),
    [assetType, order, limit, refresh],
  )

  // Hooks
  const assets = useAssets(options)
  const upload = useUploadAsset()
  const remove = useDeleteAsset()
  const linkML = useLinkMediaLibraryAsset()

  // Cleanup any scheduled re-queries on unmount
  useEffect(() => {
    return () => {
      requeryTimeoutsRef.current.forEach((id) => clearTimeout(id))
      requeryTimeoutsRef.current = []
    }
  }, [])

  const triggerRequeryBurst = useCallback(() => {
    setRefresh((r) => r + 1)
    const t1 = window.setTimeout(() => setRefresh((r) => r + 1), 600)
    const t2 = window.setTimeout(() => setRefresh((r) => r + 1), 1500)
    requeryTimeoutsRef.current.push(t1, t2)
  }, [])

  // Upload handlers
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onSelectFile = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const f = ev.target.files?.[0]
      if (!f) return
      setIsUploading(true)
      const kind = f.type.startsWith('image/') ? 'image' : 'file'
      try {
        if (kind === 'image') {
          await upload('image', f, {
            filename: f.name,
            projectId: options.projectId,
            dataset: options.dataset,
          })
        } else {
          await upload('file', f, {
            filename: f.name,
            projectId: options.projectId,
            dataset: options.dataset,
          })
        }
        // trigger re-queries so the new asset appears once indexed
        triggerRequeryBurst()
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
        setIsUploading(false)
      }
    },
    [upload, triggerRequeryBurst, options.projectId, options.dataset],
  )

  const onDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this asset?')) return
      await remove(
        createAssetHandle({assetId: id, projectId: options.projectId, dataset: options.dataset}),
      )
      // re-query after deletion
      triggerRequeryBurst()
    },
    [remove, triggerRequeryBurst, options.projectId, options.dataset],
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
    // re-query after linking
    triggerRequeryBurst()
  }, [linkML, mlAssetId, mlId, mlInstId, triggerRequeryBurst])

  return (
    <PageLayout title="Assets" subtitle={`${assets.length} assets`}>
      <Stack space={4}>
        <Card padding={4} radius={2} tone="inherit">
          <div
            className="container-inline"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            <div>
              <Label size={1} htmlFor="assetType">
                Type
              </Label>
              <select
                id="assetType"
                value={assetType}
                onChange={(e) => setAssetType(e.target.value as 'all' | 'image' | 'file')}
                style={{
                  width: '100%',
                  border: '1px solid #ccc',
                  padding: '8px',
                  borderRadius: '4px',
                }}
              >
                <option value="all">All</option>
                <option value="image">Images</option>
                <option value="file">Files</option>
              </select>
            </div>
            <div>
              <Label size={1} htmlFor="order">
                Order
              </Label>
              <input
                id="order"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                placeholder="_createdAt desc"
                style={{
                  width: '100%',
                  border: '1px solid #ccc',
                  padding: '8px',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div>
              <Label size={1} htmlFor="limit">
                Limit
              </Label>
              <input
                id="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value || '0', 10))}
                style={{
                  width: '100%',
                  border: '1px solid #ccc',
                  padding: '8px',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div>
              <Label size={1} htmlFor="upload">
                Upload file
              </Label>
              <input
                id="upload"
                ref={fileInputRef}
                onChange={onSelectFile}
                type="file"
                disabled={isUploading}
              />
              {isUploading && (
                <Text muted size={1} style={{marginTop: 4, display: 'block'}}>
                  Uploading...
                </Text>
              )}
            </div>
          </div>
        </Card>

        <Stack space={3}>
          <Text size={2} weight="semibold">
            Browse
          </Text>
          <AssetList assets={assets} onDelete={onDelete} />
        </Stack>

        <Card padding={3} radius={2} tone="inherit">
          <Stack space={3}>
            <Text size={2} weight="semibold">
              Link Media Library Asset
            </Text>
            <Flex gap={2} wrap="wrap">
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
              <Button text="Link" onClick={onLinkMl} />
            </Flex>
          </Stack>
        </Card>
      </Stack>
    </PageLayout>
  )
}
