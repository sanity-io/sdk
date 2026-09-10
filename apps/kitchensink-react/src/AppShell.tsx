import {HomeIcon} from '@sanity/icons/Home'
import {Menu, MenuButton, MenuItem} from '@sanity/ui/menu'
import {type JSX} from 'react'
import {Link, Outlet} from 'react-router'
import {Box, Button, Flex} from 'ui5'

import {navGroups} from './nav'

/**
 * Studio-adjacent chrome: a top bar and a content pane. Route paths stay the
 * same so e2e tests keep working.
 *
 * @internal
 */
export function AppShell(): JSX.Element {
  return (
    <Flex flexDirection="column" height="100vh" width="100%">
      <Flex
        as="nav"
        aria-label="Kitchen sink"
        alignItems="center"
        borderBottom
        flexShrink={0}
        gap={2}
        padding={2}
      >
        <Button as={Link} iconStart={HomeIcon} level="secondary" text="Kitchen Sink" to="/" />
        {navGroups.map((group) => (
          <MenuButton
            key={group.title}
            id={`nav-${group.title.replace(/\W+/g, '-').toLowerCase()}`}
            button={<Button level="tertiary" text={group.title} />}
            menu={
              <Menu>
                {group.items.map((item) => (
                  <MenuItem
                    as={Link}
                    icon={item.icon}
                    key={item.path}
                    text={item.title}
                    to={`/${item.path}`}
                  />
                ))}
              </Menu>
            }
          />
        ))}
      </Flex>

      <Box flexGrow={1} minWidth="0" overflow="auto" padding={4}>
        <Outlet />
      </Box>
    </Flex>
  )
}
