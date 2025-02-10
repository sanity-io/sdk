import {
  useHasPermission,
  useHasPermissionForResource,
  usePermissions,
  usePermissionsByAction,
  usePermissionsByResource,
  usePermissionsByType,
  usePermissionsForResource,
} from '@sanity/sdk-react/hooks'
import {type JSX} from 'react'

interface PermissionsSectionProps {
  title: string
  data: unknown
}

function PermissionsSection({title, data}: PermissionsSectionProps): JSX.Element {
  return (
    <details className="permission-section">
      <summary className="permission-title">{title}</summary>
      <pre className="permission-data">{JSON.stringify(data, null, 2)}</pre>
    </details>
  )
}

function BooleanSection({title, value}: {title: string; value: boolean}): JSX.Element {
  return (
    <div className="boolean-section">
      <strong>{title}:</strong> <span className={value ? 'true' : 'false'}>{String(value)}</span>
    </div>
  )
}

export function PermissionsHome(): JSX.Element {
  const hasPermission = useHasPermission('sanity.project.cors.delete')
  const hasPermissionForResource = useHasPermissionForResource('sanity.project.update', 'e2seb42p')
  const permissions = usePermissions()
  const permissionsByAction = usePermissionsByAction('read')
  const permissionsByResource = usePermissionsByResource()
  const permissionsByType = usePermissionsByType('sanity.project')
  const permissionsForResource = usePermissionsForResource('project')
  const hasPermissionForResourceType = useHasPermissionForResource(
    'sanity.project.read',
    'e2seb42p',
  )

  return (
    <div className="permissions-container">
      <h2>Permissions Overview</h2>

      <div className="boolean-permissions">
        <h3>Quick Status</h3>
        <BooleanSection title="Has Permission (sanity.project.cors.delete)" value={hasPermission} />
        <BooleanSection
          title="Has Permission For Resource (sanity.project.update, e2seb42p)"
          value={hasPermissionForResource}
        />
        <BooleanSection
          title="Has Permission For Resource Type (sanity.project.read, e2seb42p)"
          value={hasPermissionForResourceType}
        />
      </div>

      <div className="detailed-permissions">
        <h3>Detailed Permissions</h3>
        <PermissionsSection title="All Permissions" data={permissions} />
        <PermissionsSection title="Permissions By Action (read)" data={permissionsByAction} />
        <PermissionsSection title="Permissions By Resource" data={permissionsByResource} />
        <PermissionsSection title="Permissions By Type (sanity.project)" data={permissionsByType} />
        <PermissionsSection
          title="Permissions For Resource (project)"
          data={permissionsForResource}
        />
      </div>

      <style>{`
        .permissions-container {
          padding: 1rem
        }
        .boolean-permissions {
          margin-bottom: 2rem
        }
        .boolean-section {
          margin: 0.5rem 0
        }
        .true {
          color: green
          font-weight: bold
        }
        .false {
          color: red
          font-weight: bold
        }
        .permission-section {
          margin: 0.5rem 0
          border: 1px solid #eee
          border-radius: 4px
        }
        .permission-title {
          padding: 0.5rem
          cursor: pointer
          background: #f5f5f5
        }
        .permission-data {
          padding: 1rem
          margin: 0
          background: #fafafa
          max-height: 300px
          overflow: auto
        }
      `}</style>
    </div>
  )
}
