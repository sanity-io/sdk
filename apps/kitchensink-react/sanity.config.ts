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

const movieType = defineType({
  name: 'movie',
  title: 'Movie',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'tmdb_id',
      title: 'TMDB ID',
      type: 'number',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'poster_path',
      title: 'Poster Image',
      type: 'string',
    },
    {
      name: 'hosted_poster_path',
      title: 'Hosted Poster Image',
      type: 'url',
    },
    {
      name: 'release_date',
      title: 'Release Date',
      type: 'string',
    },
    {
      name: 'overview',
      title: 'Overview',
      type: 'text',
    },
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
    name: 'vo1ysemo-production',
    basePath: '/vo1ysemo-production',
    projectId: 'vo1ysemo',
    dataset: 'production',
    schema: {
      types: [movieType],
    },
  },
])
