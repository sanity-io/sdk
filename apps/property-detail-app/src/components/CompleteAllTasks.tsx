import {IntentHandlerPayload, useClient} from '@sanity/sdk-react'
import React from 'react'

import {MaintenanceSchedule} from '../types'

export function CompleteAllTasks({payload}: {payload: IntentHandlerPayload}): React.ReactElement {
  const client = useClient({apiVersion: '2025-08-01'})
  const [status, setStatus] = React.useState<'loading' | 'success' | 'error'>('loading')
  const [taskCount, setTaskCount] = React.useState(0)

  React.useEffect(() => {
    async function completeAllTasks() {
      try {
        const property = await client.getDocument(payload.documentHandle.documentId)

        if (!property?.['maintenanceSchedules'] || property['maintenanceSchedules'].length === 0) {
          throw new Error('No maintenance schedules found for this property')
        }

        // Find the first active (non-completed) maintenance schedule
        const activeSchedule = property['maintenanceSchedules'].find(
          (schedule: MaintenanceSchedule) => schedule.status !== 'completed',
        )

        if (!activeSchedule) {
          throw new Error('No active maintenance schedule found for this property')
        }

        // Fetch the full maintenance schedule document to get task references
        const maintenanceSchedule = await client.getDocument(activeSchedule._ref)

        if (!maintenanceSchedule?.['tasks']) {
          throw new Error('No tasks found for maintenance schedule')
        }

        const tasks = maintenanceSchedule['tasks']
        setTaskCount(tasks.length)

        // Create a transaction to update all tasks at once
        const transaction = client.transaction()

        // Add patch for each task to mark it as completed
        tasks.forEach((taskRef: {_ref: string}) => {
          transaction.patch(taskRef._ref, {set: {completed: true}})
        })

        // Also mark the maintenance schedule as completed
        transaction.patch(activeSchedule._ref, {set: {status: 'completed'}})

        // Execute the transaction
        await transaction.commit()

        setStatus('success')
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to complete all tasks:', error)
        setStatus('error')
      }
    }

    completeAllTasks()
  }, [client, payload.documentHandle.documentId])

  if (status === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#f5f5f5',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{textAlign: 'center'}}>
          <div
            style={{
              fontSize: '24px',
              marginBottom: '16px',
              animation: 'spin 1s linear infinite',
              display: 'inline-block',
            }}
          >
            ⚙️
          </div>
          <h2>Completing all maintenance tasks...</h2>
          <p>Please wait while we update the tasks.</p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#f0f9ff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            backgroundColor: 'white',
            padding: '40px',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            maxWidth: '400px',
          }}
        >
          <div style={{fontSize: '48px', marginBottom: '16px'}}>✅</div>
          <h2 style={{color: '#059669', marginBottom: '16px'}}>All Tasks Completed!</h2>
          <p style={{color: '#6b7280', marginBottom: '24px'}}>
            Successfully marked {taskCount} task{taskCount !== 1 ? 's' : ''} as completed.
          </p>
          <a
            href={`/property/${payload.documentHandle.documentId}`}
            style={{
              display: 'inline-block',
              backgroundColor: '#059669',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 'bold',
              marginBottom: '16px',
            }}
          >
            View Property Details
          </a>
          <div>
            <button
              onClick={() => window.close()}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #d1d5db',
                color: '#6b7280',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#fef2f2',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: '400px',
        }}
      >
        <div style={{fontSize: '48px', marginBottom: '16px'}}>❌</div>
        <h2 style={{color: '#dc2626', marginBottom: '16px'}}>Error</h2>
        <p style={{color: '#6b7280', marginBottom: '24px'}}>
          Failed to complete the maintenance tasks. Please try again.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            backgroundColor: '#dc2626',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          Back to Properties
        </a>
      </div>
    </div>
  )
}
