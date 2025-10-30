import './App.css'

import {
  type DocumentHandle,
  useDocumentProjection,
  useDocuments,
  useSendIntent,
} from '@sanity/sdk-react'
import {Suspense, useMemo, useState} from 'react'

interface Property {
  _id: string
  _type: 'property'
  address: string
  broker: {
    name: string
  }
  status: string
  rent: number
  bedrooms: number
  bathrooms: number
  location: {
    lat: number
    lng: number
  }
  tenant?: string | null
  maintenanceSchedules?: Array<{
    _id: string
    maintenanceType: string
    scheduledDate: string
    status: string
  }>
}

interface PropertyCardProps {
  doc: DocumentHandle<'property'>
}

function PropertyCard({doc}: PropertyCardProps) {
  const {sendIntent: checkMaintenance} = useSendIntent({
    documentHandle: doc,
    intentName: 'maintenanceList',
  })
  const {sendIntent: completeAllTasks} = useSendIntent({
    documentHandle: doc,
    intentName: 'completeAllTasks',
  })

  const {data: property} = useDocumentProjection<{
    address: string
    broker: {name: string}
    status: string
    rent: number
    bedrooms: number
    bathrooms: number
    location: {lat: number; lng: number}
    tenant?: string | null
    maintenanceSchedules: Array<{
      _id: string
      maintenanceType: string
      scheduledDate: string
      status: string
    }>
  }>({
    ...doc,
    projection: `{
      address,
      broker->{name},
      status,
      rent,
      bedrooms,
      bathrooms,
      location,
      tenant,
      maintenanceSchedules[]->{_id, maintenanceType, scheduledDate, status}
    }`,
  })

  if (!property) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Get the latest maintenance schedule for this property
  const latestMaintenance = property.maintenanceSchedules?.[0]

  const getMaintenanceStatus = (date: string, status: string) => {
    // Don't show overdue badge for completed schedules
    if (status === 'completed') {
      return null
    }

    const maintenanceDate = new Date(date)
    maintenanceDate.setHours(0, 0, 0, 0)

    if (maintenanceDate < today) {
      return {status: 'overdue', className: 'badge-danger'}
    } else if (maintenanceDate.getTime() === today.getTime()) {
      return {status: 'today', className: 'badge-warning'}
    } else {
      return {status: 'upcoming', className: 'badge-info'}
    }
  }

  const getStatusBadgeClassName = (status: string) => {
    switch (status) {
      case 'available':
        return 'badge-success'
      case 'occupied':
        return 'badge-secondary'
      case 'maintenance':
        return 'badge-warning'
      default:
        return 'badge-secondary'
    }
  }

  const maintenanceStatus = latestMaintenance
    ? getMaintenanceStatus(latestMaintenance.scheduledDate, latestMaintenance.status)
    : null

  const handleCheckMaintenance = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    checkMaintenance()
  }

  const handleCompleteAllTasks = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    completeAllTasks()
  }

  return (
    <div className="property-card" style={{position: 'relative', zIndex: 1}}>
      <div className="property-header">
        <h3>{property.address}</h3>
        <span className={`badge ${getStatusBadgeClassName(property.status)}`}>
          {property.status}
        </span>
      </div>
      <div className="property-details">
        <div className="property-detail">
          <span className="icon">👤</span>
          <span>{property.broker?.name || 'No broker assigned'}</span>
        </div>
        {latestMaintenance && (
          <>
            <div className="property-detail">
              <span className="icon">📅</span>
              <span>{latestMaintenance.scheduledDate}</span>
              {maintenanceStatus && (
                <span className={`badge ${maintenanceStatus.className}`}>
                  {maintenanceStatus.status}
                </span>
              )}
            </div>
            <div className="property-detail">
              <span className="icon">🔧</span>
              <span>{latestMaintenance.maintenanceType}</span>
            </div>
          </>
        )}
        <div className="property-detail">
          <span className="icon">💰</span>
          <span>${property.rent?.toLocaleString() || 0}/month</span>
        </div>
        <div className="property-detail">
          <span className="icon">🏠</span>
          <span>
            {property.bedrooms || 0} bed, {property.bathrooms || 0} bath
          </span>
        </div>
        {property.tenant && (
          <div className="property-detail">
            <span className="icon">🏠</span>
            <span>Tenant: {property.tenant}</span>
          </div>
        )}
      </div>
      <div className="property-actions">
        <button
          className="maintenance-button"
          onClick={handleCheckMaintenance}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            marginTop: '12px',
            marginRight: '8px',
          }}
        >
          🔧 Check Maintenance
        </button>

        {property.maintenanceSchedules?.some((schedule) => schedule.status !== 'completed') && (
          <button
            className="complete-all-button"
            onClick={handleCompleteAllTasks}
            style={{
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              marginTop: '12px',
            }}
          >
            ✅ Complete All Tasks
          </button>
        )}
      </div>
    </div>
  )
}

export default function PropertyManagementApp(): React.JSX.Element {
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  const {data: propertyHandles, isPending} = useDocuments({
    documentType: 'property',
    orderings: [{field: 'address', direction: 'asc'}],
  })

  // Filter properties based on selected broker and maintenance filter
  // Note: In a real app, you might want to do this filtering in the GROQ query for better performance
  const filteredProperties = useMemo(() => {
    // For now, we'll filter on the client side for simplicity
    // In production, consider moving filters to the useDocuments query
    return propertyHandles
  }, [propertyHandles])

  const getStatusBadgeClassName = (status: string) => {
    switch (status) {
      case 'available':
        return 'badge-success'
      case 'occupied':
        return 'badge-secondary'
      case 'maintenance':
        return 'badge-warning'
      default:
        return 'badge-secondary'
    }
  }

  if (isPending) {
    return (
      <div className="loading-container">
        <div>Loading properties...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-brand">
          <h1>Property Management</h1>
        </div>
      </nav>

      <main className="main-content">
        <div className="content-grid">
          {/* Map Section */}
          {/* <div className="map-section">
            <div className="map-placeholder">
              <div className="map-overlay">
                <h2>Property Locations</h2>
                <p>Interactive map would be rendered here</p>
                <div className="property-markers">
                  {filteredProperties.map((propertyHandle) => (
                    <Suspense
                      key={propertyHandle.documentId}
                      fallback={<div>Loading marker...</div>}
                    >
                      <PropertyMarker doc={propertyHandle} />
                    </Suspense>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Property List */}
          <div className="property-list-section">
            <h2>Properties</h2>
            <div className="property-list">
              {filteredProperties.map((propertyHandle) => (
                <Suspense key={propertyHandle.documentId} fallback={<div>Loading property...</div>}>
                  <PropertyCard doc={propertyHandle} />
                </Suspense>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Property Detail Modal */}
      {selectedProperty && (
        <div className="modal-overlay" onClick={() => setSelectedProperty(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedProperty.address}</h2>
              <button className="modal-close" onClick={() => setSelectedProperty(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="property-details-grid">
                <div className="detail-item">
                  <strong>Status:</strong>
                  <span className={`badge ${getStatusBadgeClassName(selectedProperty.status)}`}>
                    {selectedProperty.status}
                  </span>
                </div>
                <div className="detail-item">
                  <strong>Rent:</strong> ${selectedProperty.rent?.toLocaleString()}
                </div>
                <div className="detail-item">
                  <strong>Bedrooms:</strong> {selectedProperty.bedrooms}
                </div>
                <div className="detail-item">
                  <strong>Bathrooms:</strong> {selectedProperty.bathrooms}
                </div>
                <div className="detail-item">
                  <strong>Broker:</strong> {selectedProperty.broker?.name}
                </div>
                {selectedProperty.tenant && (
                  <div className="detail-item">
                    <strong>Tenant:</strong> {selectedProperty.tenant}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper component for property markers
// function PropertyMarker({doc}: {doc: DocumentHandle<'property'>}) {
//   const {data: property} = useDocumentProjection<{
//     address: string
//     status: string
//     location: {lat: number; lng: number}
//   }>({
//     ...doc,
//     projection: '{address, status, location}',
//   })

//   if (!property) return null

//   const getStatusClassName = (status: string) => {
//     switch (status) {
//       case 'available':
//         return 'marker-available'
//       case 'occupied':
//         return 'marker-occupied'
//       case 'maintenance':
//         return 'marker-maintenance'
//       default:
//         return 'marker-default'
//     }
//   }

//   return (
//     <div className={`property-marker ${getStatusClassName(property.status)}`}>
//       <span className="marker-text">{property.address}</span>
//     </div>
//   )
// }
