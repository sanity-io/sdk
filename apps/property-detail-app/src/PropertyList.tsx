import './App.css'

import {type DocumentHandle, useDocumentProjection, useDocuments} from '@sanity/sdk-react'
import {Suspense} from 'react'
import {Link} from 'react-router'

interface PropertyListItemProps {
  doc: DocumentHandle<'property'>
}

function PropertyListItem({doc}: PropertyListItemProps) {
  const {data: property} = useDocumentProjection<{
    address: string
    broker: {name: string}
    maintenanceSchedules: Array<{
      maintenanceType: string
      scheduledDate: string
    }>
  }>({
    ...doc,
    projection: `{
      address,
      broker->{name},
      maintenanceSchedules[]->{maintenanceType, scheduledDate}
    }`,
  })

  if (!property) return null

  // Get the latest maintenance schedule for this property
  const latestMaintenance = property.maintenanceSchedules?.[0]

  return (
    <Link to={`/property/${doc.documentId}`} className="property-link">
      <div className="property-item">
        <div className="property-info">
          <h3>{property.address}</h3>
          <p className="broker-name">Broker: {property.broker?.name || 'No broker assigned'}</p>
          {latestMaintenance && (
            <>
              <p className="maintenance-type">{latestMaintenance.maintenanceType}</p>
              <p className="maintenance-date">Scheduled: {latestMaintenance.scheduledDate}</p>
            </>
          )}
        </div>
        <div className="property-arrow">→</div>
      </div>
    </Link>
  )
}

export default function PropertyList(): React.ReactElement {
  const {
    data: propertyHandles,
    isPending,
    count,
  } = useDocuments({
    documentType: 'property',
    orderings: [{field: 'address', direction: 'asc'}],
  })

  if (isPending) {
    return (
      <div className="container">
        <h1>Property Maintenance List</h1>
        <div className="loading">Loading properties...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <h1>Property Maintenance List</h1>
      <p className="property-count">Total properties: {count}</p>
      <div className="property-list">
        {propertyHandles.map((propertyHandle) => (
          <Suspense
            key={propertyHandle.documentId}
            fallback={<div className="loading-item">Loading property...</div>}
          >
            <PropertyListItem doc={propertyHandle} />
          </Suspense>
        ))}
      </div>
    </div>
  )
}
