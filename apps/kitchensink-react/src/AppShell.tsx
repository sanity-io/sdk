import {HomeIcon} from '@sanity/icons/Home'
import {useCurrentUser} from '@sanity/sdk-react'
import {Avatar} from '@sanity/ui'
import {type JSX} from 'react'
import {Link, Outlet, useLocation} from 'react-router'
import {Box, Flex, Icon, List, Text, VStack} from 'ui5'

import {navGroups} from './nav'

const listReset = {listStyle: 'none'} as const

/**
 * Studio-adjacent chrome: a sidebar of example routes and a scrolling content
 * pane. Route paths stay the same so e2e tests keep working.
 *
 * Nav items are v5 `List.ButtonItem`s-as-Links. Avatar stays on v4 until v5
 * ships one.
 *
 * @internal
 */
export function AppShell(): JSX.Element {
  const currentUser = useCurrentUser()
  const {pathname} = useLocation()

  return (
    <Flex minHeight="100vh" width="100%">
      <Flex
        as="nav"
        aria-label="Kitchen sink"
        borderRight
        flexDirection="column"
        flexShrink={0}
        padding={2}
        width="260px"
      >
        <Flex flexDirection="column" flexGrow={1} gap={3}>
          <List style={listReset}>
            <List.ButtonItem
              as={Link}
              selected={pathname === '/'}
              start={<Icon aria-hidden icon={HomeIcon} />}
              to="/"
            >
              <List.ItemText title="Kitchen Sink" />
            </List.ButtonItem>
          </List>

          <Flex flexDirection="column" flexGrow={1} gap={4} overflow="auto">
            {navGroups.map((group) => (
              <VStack key={group.title} gap={1}>
                <Box paddingX={2} paddingY={1}>
                  <Text muted size={1} weight="medium">
                    {group.title}
                  </Text>
                </Box>
                <List style={listReset}>
                  {group.items.map((item) => {
                    const href = `/${item.path}`
                    const selected = pathname === href || pathname.startsWith(`${href}/`)
                    return (
                      <List.ButtonItem
                        as={Link}
                        key={item.path}
                        selected={selected}
                        start={<Icon aria-hidden icon={item.icon} />}
                        to={href}
                      >
                        <List.ItemText title={item.title} />
                      </List.ButtonItem>
                    )
                  })}
                </List>
              </VStack>
            ))}
          </Flex>

          <Flex alignItems="center" gap={2} padding={2}>
            <Avatar size={1} src={currentUser?.profileImage} />
            <Text muted size={1} truncate={1}>
              {currentUser?.name}
            </Text>
          </Flex>
        </Flex>
      </Flex>

      <Box flexGrow={1} minWidth="0" overflow="auto" padding={4}>
        <Outlet />
      </Box>
    </Flex>
  )
}
