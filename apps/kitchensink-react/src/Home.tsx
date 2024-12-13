import {Box, Container, Heading, Text} from '@sanity/ui'
import {Link} from 'react-router'

const Home = (): JSX.Element => {
  return (
    <Container width={1} padding={7}>
      <Box marginBottom={6}>
        <Heading as="h1" size={5} align="center">
          SDK React Kitchen Sink
        </Heading>
        <Box marginTop={5}>
          <ul style={{listStyle: 'none'}}>
            <li>
              <Link to="/project-auth">
                <Box paddingY={2} display="inline-block">
                  <Text style={{textDecoration: 'underline'}}>Project Auth &rarr;</Text>
                </Box>
              </Link>
            </li>

            <li>
              <Link to="/unauthenticated">
                <Box paddingY={2} display="inline-block">
                  <Text style={{textDecoration: 'underline'}}>Unauthenticated &rarr;</Text>
                </Box>
              </Link>
            </li>

            <li>
              <Link to="/org-auth">
                <Box paddingY={2} display="inline-block">
                  <Text style={{textDecoration: 'underline'}}>👷 Org Auth &rarr;</Text>
                </Box>
              </Link>
            </li>
            <li>
              <Link to="/cosui-simulator">
                <Box paddingY={2} display="inline-block">
                  <Text style={{textDecoration: 'underline'}}>👷 Cosui Simulator &rarr;</Text>
                </Box>
              </Link>
            </li>
          </ul>
        </Box>
      </Box>
    </Container>
  )
}

export default Home
