export function MaintenanceTaskSkeleton(): React.ReactNode {
  return (
    <div className="todo-item skeleton-loading">
      <label className="todo-label">
        <input type="checkbox" disabled className="todo-checkbox" />
        <div className="checkmark"></div>
        <span className="todo-text">
          <span className="skeleton-text">Loading task...</span>
        </span>
      </label>
      <span className="priority-badge priority-medium skeleton-text">medium</span>
    </div>
  )
}
