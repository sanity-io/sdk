import './Maintenance.css'

import {useDocumentProjection} from '@sanity/sdk-react'
import React, {Suspense, useState} from 'react'
import {Link, useParams} from 'react-router'

import {MaintenanceTask} from './components/MaintenanceTask'
import {MaintenanceTaskSkeleton} from './components/MaintenanceTaskSkeleton'
import {ScheduleStateDropdown} from './components/ScheduleStateDropdown'

export default function MaintenanceApp(): React.ReactNode {
  const {propertyId} = useParams<{propertyId: string}>()
  const [notes, setNotes] = useState('')
  const [isSubmitted] = useState(false)

  // Fetch the property document
  const {data: property} = useDocumentProjection<{
    address: string
  }>({
    documentId: propertyId || '',
    documentType: 'property',
    projection: '{address}',
  })

  // Fetch the maintenance schedule for this property
  const {data} = useDocumentProjection<{
    maintenanceSchedules: Array<{
      _id: string
      maintenanceType: string
      scheduledDate: string
      status: string
      notes?: string
      assignedBroker: {name: string}
      tasks: Array<{_ref: string; _key: string; _type: string}>
    }>
  }>({
    documentId: propertyId || '',
    documentType: 'property',
    projection: `{
      maintenanceSchedules[]->{
        _id,
        maintenanceType,
        scheduledDate,
        status,
        notes,
        assignedBroker->{name},
        tasks[]
      }
    }`,
  })

  const currentSchedule = data?.maintenanceSchedules?.[0] // Get the latest maintenance schedule

  if (!propertyId) {
    return (
      <div className="maintenance-container">
        <div className="error-message">
          <h2>Property ID not found</h2>
          <Link to="/" className="back-link">
            ← Back to Property List
          </Link>
        </div>
      </div>
    )
  }

  if (!property) {
    return (
      <div className="maintenance-container">
        <div className="loading">Loading property details...</div>
      </div>
    )
  }

  if (!currentSchedule) {
    return (
      <div className="maintenance-container">
        <div className="maintenance-header">
          <Link to="/" className="back-link">
            ← Back to Property List
          </Link>
          <h1>{property.address}</h1>
        </div>
        <div className="no-maintenance">
          <h2>No maintenance scheduled</h2>
          <p>There are currently no maintenance schedules for this property.</p>
        </div>
      </div>
    )
  }

  if (isSubmitted) {
    return (
      <div className="maintenance-container">
        <div className="maintenance-header">
          <Link to="/" className="back-link">
            ← Back to Property List
          </Link>
          <h1>Maintenance Completed!</h1>
        </div>
        <div className="success-message">
          <div className="checkmark">✓</div>
          <h2>Great job!</h2>
          <p>
            The maintenance for <strong>{property.address}</strong> has been completed.
          </p>
          <div className="success-actions">
            <Link to="/" className="success-button">
              Back to Properties
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="maintenance-container">
      <div className="maintenance-header">
        <Link to="/" className="back-link">
          ← Back to Property List
        </Link>
        <h1>{property.address}</h1>
        <div className="property-details">
          <span className="detail-item">
            <strong>Broker:</strong> {currentSchedule.assignedBroker?.name || 'No broker assigned'}
          </span>
          <span className="detail-item">
            <strong>Type:</strong> {currentSchedule.maintenanceType}
          </span>
          <span className="detail-item">
            <strong>Scheduled:</strong> {currentSchedule.scheduledDate}
          </span>
          <span className="detail-item">
            <strong>Status:</strong> {currentSchedule.status}
          </span>
        </div>
      </div>

      <div className="maintenance-content">
        <div className="todos-section">
          <h2>Maintenance Tasks</h2>
          <div className="todos-list">
            {currentSchedule?.tasks?.map((taskRef) => (
              <Suspense key={taskRef._ref} fallback={<MaintenanceTaskSkeleton />}>
                <MaintenanceTask
                  doc={{
                    documentId: taskRef._ref,
                    documentType: 'maintenanceTask' as const,
                    projectId: '9wmez61s',
                    dataset: 'production',
                  }}
                />
              </Suspense>
            )) || (
              <div className="no-tasks">
                <p>No tasks assigned for this maintenance.</p>
              </div>
            )}
          </div>
        </div>

        <div className="notes-section">
          <h2>Additional Notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional notes about the maintenance work performed..."
            className="notes-textarea"
            rows={4}
          />
        </div>

        <div className="submit-section">
          <ScheduleStateDropdown
            scheduleId={currentSchedule._id}
            currentState={currentSchedule.status}
          />
        </div>
      </div>
    </div>
  )
}
