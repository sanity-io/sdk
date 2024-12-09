import {Flex, Text} from '@sanity/ui'
import styled from 'styled-components'

interface DocumentTableItemField {
  name: string
  value: string
}

interface DocumentTableItem {
  id: string
  title: string
  media?: string
  fields: Array<DocumentTableItemField>
}

/**
 * @public
 */
export interface DocumentTableUIProps {
  documents: Array<DocumentTableItem>
}

const Table = styled.table`
  border-collapse: collapse;
  inline-size: 100%;
  position: relative;
`

const TableRow = styled.tr`
  &:nth-child(even) {
    background-color: hsl(0deg 0% 0% / 0.025);
  }
`

const TableCell = styled.td`
  padding-block: 1em;
  padding-inline: 1.5em;
  text-align: start;
`

// Todo: replace with actual media (either image or icon)
const TempMedia = styled.div`
  aspect-ratio: 1 / 1;
  inline-size: 33px;
  background-color: #ccc;
`

/**
 * @public
 */
export default function DocumentTableUI({documents = []}: DocumentTableUIProps): JSX.Element {
  // Presume all documents have the same array of `fields`
  const {fields: tableFields} = documents[0]
  const columnNames = tableFields.map((field) => field.name)

  return (
    <Table>
      <thead>
        <TableRow>
          <TableCell as="th" scope="col">
            <Text size={1} weight="bold">
              Title
            </Text>
          </TableCell>

          {columnNames.map((name) => (
            <TableCell as="th" scope="col" key={name}>
              <Text size={1} weight="bold">
                {name}
              </Text>
            </TableCell>
          ))}
        </TableRow>
      </thead>

      <tbody>
        {documents.map((doc) => {
          const {id, media, title, fields} = doc
          return (
            <TableRow key={id}>
              <TableCell as="th" scope="row">
                <Flex align="center" gap={3}>
                  {media ? <TempMedia /> : null}
                  <Text size={1} weight="medium">
                    {title}
                  </Text>
                </Flex>
              </TableCell>

              {fields.map(({name, value}) => (
                <TableCell key={name}>
                  <Text size={1} muted>
                    {value}
                  </Text>
                </TableCell>
              ))}
            </TableRow>
          )
        })}
      </tbody>
    </Table>
  )
}
