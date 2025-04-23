import {defineConfig, defineField, defineType} from 'sanity'

const authorType = defineType({
  name: 'author',
  type: 'document',
  title: 'Author',
  description: 'This represents an author',
  fields: [
    defineField({name: 'name', title: 'Name', type: 'string'}),
    defineField({name: 'bestFriend', type: 'reference', to: [{type: 'author'}]}),
    defineField({
      name: 'role',
      title: 'Role',
      type: 'string',
      options: {
        list: [
          {value: 'developer', title: 'Developer'},
          {value: 'designer', title: 'Designer'},
          {value: 'ops', title: 'Operations'},
        ],
      },
    }),
    defineField({name: 'image', title: 'Image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'awards', title: 'Awards', type: 'array', of: [{type: 'string'}]}),
    defineField({
      name: 'favoriteBooks',
      title: 'Favorite books',
      type: 'array',
      of: [{type: 'reference', to: {type: 'book'}}],
    }),
    defineField({
      name: 'minimalBlock',
      title: 'Reset all options',
      type: 'array',
      of: [{type: 'block'}],
    }),
  ],
})

const bookType = defineType({
  name: 'book',
  type: 'document',
  title: 'Book',
  description: 'This is just a simple type for generating some test data',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string'}),
    defineField({name: 'author', title: 'Author', type: 'reference', to: {type: 'author'}}),
    defineField({name: 'coverImage', title: 'Cover Image', type: 'image'}),
    defineField({name: 'publicationYear', title: 'Year of publication', type: 'number'}),
    defineField({
      name: 'reviewsInline',
      type: 'array',
      of: [
        {type: 'object', name: 'review', fields: [{name: 'title', title: 'Title', type: 'string'}]},
      ],
    }),
    defineField({
      name: 'genre',
      title: 'Genre',
      type: 'string',
      options: {
        list: [
          {title: 'Fiction', value: 'fiction'},
          {title: 'Non Fiction', value: 'nonfiction'},
          {title: 'Poetry', value: 'poetry'},
        ],
      },
    }),
  ],
})

// Define a 'dog' schema type based on the Dog interface
const dogType = defineType({
  name: 'dog',
  title: 'Dog',
  type: 'document',
  fields: [
    defineField({name: 'name', title: 'Name', type: 'string'}),
    defineField({name: 'age', title: 'Age', type: 'string'}), // Assuming age is stored as string per interface
    defineField({name: 'color', title: 'Color', type: 'string'}),
    defineField({name: 'ears', title: 'Ears', type: 'string'}),
    defineField({name: 'status', title: 'Status', type: 'string'}),
    defineField({name: 'weight', title: 'Weight', type: 'string'}), // Assuming weight is stored as string per interface
    defineField({name: 'description', title: 'Description', type: 'text'}),
    defineField({name: 'images', title: 'Images', type: 'array', of: [{type: 'image'}]}),
  ],
})

export default defineConfig([
  {
    name: 'ppsg7ml5-test',
    basePath: '/ppsg7ml5-test',
    projectId: 'ppsg7ml5',
    dataset: 'test',
    schema: {
      types: [bookType, authorType],
    },
  },
  {
    name: 'ezwd8xes-production',
    basePath: '/ezwd8xes-production',
    projectId: 'ezwd8xes',
    dataset: 'production',
    schema: {
      types: [dogType],
    },
  },
])
