import {Box, Card, Container, Flex, Heading, Stack, Text} from '@sanity/ui'
import {type JSX} from 'react'
import {Link} from 'react-router'

const styles = {
  card: {
    transition: 'all 0.2s ease-in-out',
    cursor: 'pointer',
  },
  cardHover: {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
  },
}

const menuItems = [
  {
    title: 'Project Auth',
    path: '/project-auth',
    icon: '🔐',
  },
  {
    title: 'Unauthenticated',
    path: '/unauthenticated',
    icon: '🌐',
  },
  {
    title: 'Org Auth',
    path: '/org-auth',
    icon: '👷',
  },
  {
    title: 'Comlink Playground',
    path: '/comlink-demo',
    icon: '🛠️',
  },
  {
    title: 'Sanity App',
    path: '/sanity-app',
    icon: '📲',
  },
]

const Home = (): JSX.Element => {
  return (
    <Container width={2} padding={7}>
      <Card padding={5} radius={3} shadow={1}>
        <Stack space={5}>
          <Box>
            <Heading as="h1" size={4} align="center">
              SDK React Kitchen Sink
            </Heading>
            <Box marginTop={3}>
              <Text align="center" size={2} style={{color: '#6e7683'}}>
                Explore different authentication and functionality examples
              </Text>
            </Box>
          </Box>

          <Flex direction="column" gap={3}>
            {menuItems.map((item) => (
              <Link key={item.path} to={item.path} style={{textDecoration: 'none'}}>
                <Card
                  padding={4}
                  radius={3}
                  tone="default"
                  style={styles.card}
                  className="hover-card"
                >
                  <Flex align="center" gap={3}>
                    <Text size={3}>{item.icon}</Text>
                    <Text size={2} style={{color: '#f46b60'}}>
                      {item.title} <span className="arrow">→</span>
                    </Text>
                  </Flex>
                </Card>
              </Link>
            ))}
          </Flex>
        </Stack>
      </Card>
    </Container>
  )
}

export default Home
