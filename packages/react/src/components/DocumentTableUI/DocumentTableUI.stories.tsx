import {type Meta, type StoryObj} from '@storybook/react'

import DocumentTableUI from './DocumentTableUI.tsx'

const meta: Meta<typeof DocumentTableUI> = {
  title: 'DocumentTableUI',
  component: DocumentTableUI,
}

export default meta
type Story = StoryObj<typeof meta>

const fieldIndexes = ['City', 'Role', 'Favourite fruit']

const mockDocs = [
  {
    title: 'Adam',
    fields: ['Los Angeles', 'Principal Product Designer', 'Apple'],
  },
  {
    title: 'Binoy',
    fields: ['Raleigh', 'Senior Software Engineer', 'Banana'],
  },
  {
    title: 'Carolina',
    fields: ['New York City', 'Senior Software Engineer', 'Cantaloupe'],
  },
  {
    title: 'Cole',
    fields: ['Winnipeg', 'Senior Design Engineer', 'Cashew'],
  },
  {
    title: 'KJ',
    fields: ['Pleasant Hill', 'Senior Engineering Manager', 'Kiwi'],
  },
  {
    title: 'Rico',
    fields: ['Chicago', 'Senior Software Engineer', 'Raisin'],
  },
  {
    title: 'Rune',
    fields: ['San Francisco', 'Senior Product Manager', 'Runeberry'],
  },
  {
    title: 'Ryan',
    fields: ['Boulder', 'Staff Software Engineer', 'Rye bread'],
  },
].map((person, personIndex) => ({
  id: String(personIndex),
  title: person.title,
  media: 'yes',
  fields: person.fields.map((field, fieldIndex) => ({
    name: fieldIndexes[fieldIndex],
    value: field,
  })),
}))

export const Default: Story = {
  args: {
    documents: mockDocs,
  },
  render: (props) => {
    return <DocumentTableUI {...props} />
  },
}
