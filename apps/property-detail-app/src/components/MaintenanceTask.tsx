import {DocumentHandle, useDocument, useEditDocument} from '@sanity/sdk-react'

interface MaintenanceTaskProps {
  doc: DocumentHandle<'maintenanceTask'>
}

export function MaintenanceTask({doc}: MaintenanceTaskProps): React.ReactNode {
  const {data: task} = useDocument<{
    task: string
    completed: boolean
    priority: string
    notes?: string
  }>(doc)

  const editTask = useEditDocument<boolean>({...doc, path: 'completed'})

  if (!task) return null

  const handleToggle = async () => {
    try {
      // useDocument + useEditDocument handles optimistic updates automatically
      await editTask(!task.completed)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update task:', error)
    }
  }

  const getPriorityClass = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'priority-high'
      case 'medium':
        return 'priority-medium'
      case 'low':
        return 'priority-low'
      default:
        return 'priority-medium'
    }
  }

  return (
    <div className={`todo-item ${task.completed ? 'completed' : ''}`}>
      <div className="todo-main">
        <label className="todo-label">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={handleToggle}
            className="todo-checkbox"
          />
          <div className="checkmark"></div>
          <span className={`todo-text ${task.completed ? 'completed' : ''}`}>{task.task}</span>
        </label>
      </div>
      <span className={`priority-badge ${getPriorityClass(task.priority)}`}>{task.priority}</span>
      {task.notes && (
        <div className="todo-notes">
          <small>{task.notes}</small>
        </div>
      )}
    </div>
  )
}
