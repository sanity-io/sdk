import React from 'react'

export function LoadingFallback(): React.JSX.Element {
  return (
    <div className="app-container">
      <div className="loading-header">
        <div className="loading-title"></div>
        <div className="loading-subtitle"></div>
      </div>

      <div className="loading-spinner-container">
        <div className="loading-spinner"></div>
        <p className="loading-text">Loading your property data...</p>
      </div>

      {/* Skeleton loading cards */}
      <div className="property-list">
        {[1, 2, 3].map((index) => (
          <div key={index} className="property-item loading-skeleton">
            <div className="property-info">
              <div className="skeleton-line skeleton-title"></div>
              <div className="skeleton-line skeleton-subtitle"></div>
              <div className="skeleton-line skeleton-details"></div>
            </div>
            <div className="skeleton-arrow"></div>
          </div>
        ))}
      </div>
    </div>
  )
}
