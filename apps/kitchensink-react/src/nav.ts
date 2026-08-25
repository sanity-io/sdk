import {ActivityIcon} from '@sanity/icons/Activity'
import {BlockContentIcon} from '@sanity/icons/BlockContent'
import {BoltIcon} from '@sanity/icons/Bolt'
import {ComposeIcon} from '@sanity/icons/Compose'
import {CubeIcon} from '@sanity/icons/Cube'
import {DashboardIcon} from '@sanity/icons/Dashboard'
import {DesktopIcon} from '@sanity/icons/Desktop'
import {DocumentsIcon} from '@sanity/icons/Documents'
import {EditIcon} from '@sanity/icons/Edit'
import {FolderIcon} from '@sanity/icons/Folder'
import {GenerateIcon} from '@sanity/icons/Generate'
import {ImagesIcon} from '@sanity/icons/Images'
import {LinkIcon} from '@sanity/icons/Link'
import {ListIcon} from '@sanity/icons/List'
import {MasterDetailIcon} from '@sanity/icons/MasterDetail'
import {PresentationIcon} from '@sanity/icons/Presentation'
import {ProjectsIcon} from '@sanity/icons/Projects'
import {PublishIcon} from '@sanity/icons/Publish'
import {SchemaIcon} from '@sanity/icons/Schema'
import {SearchIcon} from '@sanity/icons/Search'
import {ThLargeIcon} from '@sanity/icons/ThLarge'
import {UsersIcon} from '@sanity/icons/Users'
import {type ComponentType, type SVGProps} from 'react'

/**
 * An icon component from `@sanity/icons`.
 *
 * @internal
 */
export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>

/**
 * A single example destination. `path` is the React Router path without a
 * leading slash and must stay in sync with the routes in `AppRoutes`.
 *
 * @internal
 */
export interface NavItem {
  path: string
  title: string
  icon: NavIcon
}

/**
 * A labeled group of example destinations.
 *
 * @internal
 */
export interface NavGroup {
  title: string
  items: NavItem[]
}

/**
 * Kitchen sink example routes, grouped for the app shell menus.
 *
 * @internal
 */
export const navGroups: NavGroup[] = [
  {
    title: 'Documents',
    items: [
      {path: 'document-list', title: 'Document list', icon: ListIcon},
      {path: 'document-grid', title: 'Document grid', icon: ThLargeIcon},
      {path: 'document-editor', title: 'Document editor', icon: EditIcon},
      {path: 'document-projection', title: 'Document projection', icon: SchemaIcon},
      {path: 'search', title: 'Search', icon: SearchIcon},
      {path: 'portable-text', title: 'Portable Text', icon: BlockContentIcon},
      {path: 'multi-resource', title: 'Multi-resource', icon: DocumentsIcon},
      {path: 'org-document-explorer', title: 'Org document explorer', icon: FolderIcon},
    ],
  },
  {
    title: 'Releases & presence',
    items: [
      {path: 'releases', title: 'Releases', icon: PublishIcon},
      {path: 'perspectives', title: 'Perspectives', icon: PresentationIcon},
      {path: 'presence', title: 'Presence', icon: ActivityIcon},
    ],
  },
  {
    title: 'Dashboard',
    items: [
      {
        path: 'document-dashboard-interactions',
        title: 'Studio interactions',
        icon: MasterDetailIcon,
      },
      {path: 'dashboard-context', title: 'Dashboard context', icon: DashboardIcon},
      {path: 'workspaces', title: 'Workspaces', icon: DesktopIcon},
      {path: 'agent-resource-context', title: 'Agent resource context', icon: CubeIcon},
      {path: 'agent-actions', title: 'Agent actions', icon: GenerateIcon},
      {path: 'canvas', title: 'Canvas', icon: ComposeIcon},
      {path: 'intents', title: 'Intents', icon: BoltIcon},
      {path: 'media-library', title: 'Media library', icon: ImagesIcon},
    ],
  },
  {
    title: 'People & projects',
    items: [
      {path: 'users', title: 'Users', icon: UsersIcon},
      {path: 'projects', title: 'Projects', icon: ProjectsIcon},
    ],
  },
  {
    title: 'Demos',
    items: [{path: 'comlink-demo', title: 'Comlink', icon: LinkIcon}],
  },
]
