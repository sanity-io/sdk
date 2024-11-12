import {EditIcon, EyeClosedIcon, EyeOpenIcon, UserIcon} from '@sanity/icons'
import {Box, Flex, rem, Stack, Tab, TabList, Text} from '@sanity/ui'
import {useState} from 'react'
import styled from 'styled-components'

const Root = styled(Flex)`
  height: ${rem(33)};
  box-sizing: content-box;
`

const ListRoot = styled(Box)`
  border: 1px solid #e6e6e6;
  border-radius: 3px;
  width: 400px;
  overflow-y: auto;
  height: -webkit-fill-available;
  margin-bottom: 100px;
  background-color: white;
`

function PreviewCard({title, subtitle}: {title: string; subtitle: string}) {
  return (
    <Root align="center" data-testid="default-preview" padding={2} paddingLeft={3}>
      <Flex align="center" flex={1} gap={2}>
        <Box flex="none">
          <UserIcon fontSize={33} />
        </Box>

        <Stack data-testid="default-preview__header" flex={1} space={2}>
          <Text size={1} style={{color: 'inherit'}} textOverflow="ellipsis" weight="medium">
            {title}
          </Text>

          <Text muted size={1} textOverflow="ellipsis">
            {subtitle}
          </Text>
        </Stack>
      </Flex>
    </Root>
  )
}

/**
 * This component is an example of using the Studio looking
 * DocumentList in a custom application inside COSI
 */
function DocumentList({id}: {id: string}): JSX.Element {
  return (
    <ListRoot padding={3} paddingBottom={2}>
      {Array.from({length: 100}).map((_, i) => (
        <PreviewCard title={`${id} Document ${i}`} subtitle={`Subtitle ${i}`} key={i} />
      ))}
    </ListRoot>
  )
}

export function CustomDocumentList(): JSX.Element {
  const [id, setId] = useState('Draft')

  return (
    <>
      <h1>Custom Document List</h1>
      <TabList space={2} paddingBottom={3}>
        <Tab
          aria-controls="content-panel"
          icon={EditIcon}
          id="Draft"
          label="Draft Content"
          onClick={() => setId('Draft')}
          selected={id === 'Draft'}
        />
        <Tab
          aria-controls="preview-panel"
          icon={id === 'Published' ? EyeOpenIcon : EyeClosedIcon}
          onClick={() => setId('Published')}
          id="Published"
          label="Published Content"
          selected={id === 'Published'}
        />
      </TabList>

      <DocumentList id={id} />
    </>
  )
}
