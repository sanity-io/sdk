import {defineType, defineField} from 'sanity'

export const maintenanceSchedule = defineType({
  name: 'maintenanceSchedule',
  title: 'Maintenance Schedule',
  type: 'document',
  fields: [
    defineField({
      name: 'property',
      title: 'Property',
      type: 'reference',
      to: [{type: 'property'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'maintenanceType',
      title: 'Maintenance Type',
      type: 'string',
      options: {
        list: [
          {title: 'HVAC Service', value: 'HVAC Service'},
          {title: 'Plumbing Check', value: 'Plumbing Check'},
          {title: 'Roof Inspection', value: 'Roof Inspection'},
          {title: 'Electrical Repair', value: 'Electrical Repair'},
          {title: 'Appliance Service', value: 'Appliance Service'},
          {title: 'General Inspection', value: 'General Inspection'},
          {title: 'Cleaning', value: 'Cleaning'},
          {title: 'Landscaping', value: 'Landscaping'},
          {title: 'Other', value: 'Other'},
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'scheduledDate',
      title: 'Scheduled Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'assignedBroker',
      title: 'Assigned Broker',
      type: 'reference',
      to: [{type: 'broker'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tasks',
      title: 'Tasks',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'maintenanceTask'}]}],
      description: 'List of tasks to be completed for this maintenance',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Scheduled', value: 'scheduled'},
          {title: 'In Progress', value: 'in_progress'},
          {title: 'Completed', value: 'completed'},
          {title: 'Cancelled', value: 'cancelled'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
      initialValue: 'scheduled',
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      description: 'Additional notes about this maintenance schedule',
    }),
    defineField({
      name: 'completedAt',
      title: 'Completed At',
      type: 'datetime',
      description: 'When this maintenance was completed',
    }),
  ],
  preview: {
    select: {
      property: 'property.address',
      maintenanceType: 'maintenanceType',
      scheduledDate: 'scheduledDate',
      status: 'status',
    },
    prepare(selection) {
      const {property, maintenanceType, scheduledDate, status} = selection
      return {
        title: `${maintenanceType || 'Maintenance'} - ${property || 'Unknown Property'}`,
        subtitle: `${scheduledDate || 'No date'} • Status: ${status || 'scheduled'}`,
      }
    },
  },
})
