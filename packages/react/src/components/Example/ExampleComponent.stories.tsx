import {type Meta, type StoryObj} from '@storybook/react'

import ExampleComponent from './ExampleComponent'

const meta: Meta<typeof ExampleComponent> = {
  title: 'Example Component',
  component: ExampleComponent,
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {},
}
