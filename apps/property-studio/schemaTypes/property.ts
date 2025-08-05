import {defineType, defineField} from 'sanity'

export const property = defineType({
  name: 'property',
  title: 'Property',
  type: 'document',
  fields: [
    defineField({
      name: 'address',
      title: 'Address',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'broker',
      title: 'Broker',
      type: 'reference',
      to: [{type: 'broker'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          {title: 'Available', value: 'available'},
          {title: 'Occupied', value: 'occupied'},
          {title: 'Maintenance', value: 'maintenance'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'rent',
      title: 'Monthly Rent',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'bedrooms',
      title: 'Bedrooms',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'bathrooms',
      title: 'Bathrooms',
      type: 'number',
      validation: (Rule) => Rule.required().min(0),
    }),
    defineField({
      name: 'location',
      title: 'Location',
      type: 'geopoint',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tenant',
      title: 'Current Tenant',
      type: 'string',
      description: 'Name of current tenant (if occupied)',
    }),
    defineField({
      name: 'maintenanceSchedules',
      title: 'Maintenance Schedules',
      type: 'array',
      of: [{type: 'reference', to: [{type: 'maintenanceSchedule'}]}],
    }),
  ],
  preview: {
    select: {
      title: 'address',
      subtitle: 'status',
    },
    prepare(selection) {
      const {title, subtitle} = selection
      return {
        title: title || 'Untitled Property',
        subtitle: subtitle ? `Status: ${subtitle}` : '',
      }
    },
  },
})
