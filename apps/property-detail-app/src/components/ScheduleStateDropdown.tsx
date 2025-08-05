import {useSendIntent} from '@sanity/sdk-react'
import React, {useState} from 'react'

interface ScheduleStateDropdownProps {
  scheduleId: string
  currentState: string
}

const scheduleStates = [
  {value: 'scheduled', label: 'Scheduled'},
  {value: 'in_progress', label: 'In Progress'},
  {value: 'completed', label: 'Completed'},
  {value: 'cancelled', label: 'Cancelled'},
]

export function ScheduleStateDropdown({
  scheduleId,
  currentState,
}: ScheduleStateDropdownProps): React.ReactNode {
  const [selectedState, setSelectedState] = useState(currentState)

  const {sendIntent} = useSendIntent({
    intentName: 'editScheduleState',
    documentHandle: {
      documentId: scheduleId,
      documentType: 'maintenanceSchedule',
      projectId: '9wmez61s',
      dataset: 'production',
    },
    params: {
      state: selectedState,
    },
  })

  const handleStateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedState(event.target.value)
  }

  const handleSubmit = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    sendIntent()
  }

  const selectedStateLabel =
    scheduleStates.find((state) => state.value === selectedState)?.label || 'Unknown'

  return (
    <div className="schedule-state-dropdown">
      <div className="dropdown-container">
        <label htmlFor="schedule-state" className="dropdown-label">
          Change schedule status:
        </label>
        <select
          id="schedule-state"
          value={selectedState}
          onChange={handleStateChange}
          className="state-select"
        >
          {scheduleStates.map((state) => (
            <option key={state.value} value={state.value}>
              {state.label}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={handleSubmit}
        className="submit-button state-action-button"
        disabled={selectedState === currentState}
      >
        Mark schedule as {selectedStateLabel} and view
      </button>
    </div>
  )
}
