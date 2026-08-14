import {HomeIcon} from '@sanity/icons/Home'
import {useCurrentUser} from '@sanity/sdk-react'
import {Avatar, Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {type JSX} from 'react'
import {Link, Outlet, useLocation} from 'react-router'

import {navGroups} from './nav'

const listReset = {listStyle: 'none', margin: 0, padding: 0} as const

/**
 * Studio-adjacent chrome: a sidebar of example routes and a scrolling content
 * pane. Route paths stay the same so e2e tests keep working.
 *
 * Items are bleed Buttons-as-Links, the same pattern Studio, Ada, and Canvas
 * use for persistent left nav. Selected state comes from `selected` only.
 *
 * @internal
 */
export function AppShell(): JSX.Element {
  const currentUser = useCurrentUser()
  const {pathname} = useLocation()

  return (
    <Flex style={{minHeight: '100vh', width: '100%'}}>
      <Card
        as="nav"
        aria-label="Kitchen sink"
        borderRight
        display="flex"
        padding={2}
        style={{width: 260, flexShrink: 0}}
      >
        <Flex direction="column" flex={1} gap={3}>
          <Button
            as={Link}
            fontSize={1}
            icon={HomeIcon}
            justify="flex-start"
            mode="bleed"
            padding={2}
            radius={2}
            selected={pathname === '/'}
            text="Kitchen Sink"
            textWeight="semibold"
            to="/"
            width="fill"
          />

          <Stack flex={1} gap={4} style={{overflow: 'auto'}}>
            {navGroups.map((group) => (
              <Stack key={group.title} as="ul" gap={1} style={listReset}>
                <Box as="li" paddingX={2} paddingY={1}>
                  <Text muted size={1} weight="medium">
                    {group.title}
                  </Text>
                </Box>
                {group.items.map((item) => {
                  const href = `/${item.path}`
                  const selected = pathname === href || pathname.startsWith(`${href}/`)
                  return (
                    <Stack as="li" key={item.path}>
                      <Button
                        as={Link}
                        fontSize={1}
                        gap={2}
                        icon={item.icon}
                        justify="flex-start"
                        mode="bleed"
                        padding={2}
                        radius={2}
                        selected={selected}
                        text={item.title}
                        to={href}
                        width="fill"
                      />
                    </Stack>
                  )
                })}
              </Stack>
            ))}
          </Stack>

          <Flex align="center" gap={2} padding={2}>
            <Avatar size={1} src={currentUser?.profileImage} />
            <Text muted size={1} textOverflow="ellipsis">
              {currentUser?.name}
            </Text>
          </Flex>
        </Flex>
      </Card>

      <Box flex={1} padding={4} style={{minWidth: 0, overflow: 'auto'}}>
        <Outlet />
      </Box>
    </Flex>
  )
}
