import {defineType, defineField} from 'sanity'

export const maintenanceTask = defineType({
  name: 'maintenanceTask',
  title: 'Maintenance Task',
  type: 'document',
  fields: [
    defineField({
      name: 'task',
      title: 'Task Description',
      type: 'text',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'completed',
      title: 'Completed',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'priority',
      title: 'Priority',
      type: 'string',
      options: {
        list: [
          {title: 'High', value: 'high'},
          {title: 'Medium', value: 'medium'},
          {title: 'Low', value: 'low'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
      initialValue: 'medium',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      description: 'Additional notes or comments about this task',
    }),
    defineField({
      name: 'completedAt',
      title: 'Completed At',
      type: 'datetime',
      description: 'When this task was completed',
    }),
  ],
  preview: {
    select: {
      title: 'task',
      subtitle: 'priority',
      completed: 'completed',
    },
    prepare(selection) {
      const {title, subtitle, completed} = selection
      return {
        title: title || 'Untitled Task',
        subtitle: `Priority: ${subtitle || 'medium'} ${completed ? '✅' : '⏳'}`,
      }
    },
  },
})
