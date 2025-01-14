import {defineField, defineType, type Rule} from '@sanity/types'

const AUTHOR_ROLES = [
  {value: 'developer', title: 'Developer'},
  {value: 'designer', title: 'Designer'},
  {value: 'ops', title: 'Operations'},
]

const authorType = defineType({
  name: 'author',
  type: 'document',
  title: 'Author',
  description: 'This represents an author',
  preview: {
    select: {
      title: 'name',
      awards: 'awards',
      role: 'role',
      relatedAuthors: 'relatedAuthors',
      lastUpdated: '_updatedAt',
      media: 'image',
    },
    prepare({title, media, awards, role: roleName}) {
      const role = roleName ? AUTHOR_ROLES.find((option) => option.value === roleName) : undefined
      const awardsText = Array.isArray(awards) && awards.filter(Boolean).join(', ')

      return {
        title: typeof title === 'string' ? title : undefined,
        media,
        subtitle: [role?.title, awardsText].filter(Boolean).join(' · '),
      }
    },
  },
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      options: {
        search: {weight: 100},
      },
      validation: (rule) => rule.required(),
    }),
    {
      name: 'bestFriend',
      title: 'Best friend',
      type: 'reference',
      to: [{type: 'author'}],
    },
    {
      name: 'role',
      title: 'Role',
      type: 'string',
      options: {
        list: AUTHOR_ROLES,
      },
    },
    {
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
    },
    {
      name: 'awards',
      title: 'Awards',
      type: 'array',
      of: [
        {
          type: 'string',
        },
      ],
    },
    {
      name: 'favoriteBooks',
      title: 'Favorite books',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: {type: 'book'},
        },
      ],
    },
    {
      name: 'minimalBlock',
      title: 'Reset all options',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [],
          lists: [],
          marks: {
            decorators: [],
            annotations: [],
          },
        },
      ],
    },
    {
      name: 'locked',
      title: 'Locked',
      description: 'Used for testing the "locked" permissions pattern',
      type: 'boolean',
    },
  ],

  initialValue: () => ({
    name: 'Foo',
    bestFriend: {_type: 'reference', _ref: 'foo-bar'},
    image: {
      _type: 'image',
      asset: {
        _ref: 'image-8dcc1391e06e4b4acbdc6bbf2e8c8588d537cbb8-4896x3264-jpg',
        _type: 'reference',
      },
    },
  }),
})

function formatSubtitle(book: {authorName?: string; authorBFF?: string; publicationYear?: string}) {
  return [
    'By',
    book.authorName || '<unknown>',
    book.authorBFF && `[BFF ${book.authorBFF} 🤞]`,
    book.publicationYear && `(${book.publicationYear})`,
  ]
    .filter(Boolean)
    .join(' ')
}

const bookType = defineType({
  name: 'book',
  type: 'document',
  title: 'Book',
  description: 'This is just a simple type for generating some test data',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (rule: Rule) => rule.min(5).max(100),
    },
    {
      name: 'image',
      type: 'image',
    },
    // {
    //   type: 'markdown',
    //   name: 'descriptionMd',
    //   title: 'Description (markdown)',
    // },
    {
      name: 'translations',
      title: 'Translations',
      type: 'object',
      fields: [
        {name: 'no', type: 'string', title: 'Norwegian (Bokmål)'},
        {name: 'nn', type: 'string', title: 'Norwegian (Nynorsk)'},
        {name: 'se', type: 'string', title: 'Swedish'},
      ],
    },
    {
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: {type: 'author', title: 'Author'},
    },
    {
      name: 'coverImage',
      title: 'Cover Image',
      type: 'image',
      options: {hotspot: true},
    },
    {
      name: 'publicationYear',
      title: 'Year of publication',
      type: 'number',
    },
    {
      name: 'isbn',
      title: 'ISBN number',
      description: 'ISBN-number of the book. Not shown in studio.',
      type: 'number',
      hidden: true,
    },
    {
      name: 'reviewsInline',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'review',
          fields: [
            {
              name: 'title',
              title: 'Title',
              type: 'string',
              validation: (rule: Rule) => rule.required(),
            },
          ],
        },
      ],
    },
    {
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
    },
  ],
  preview: {
    select: {
      title: 'title',
      translations: 'translations',
      createdAt: '_createdAt',
      authorName: 'author.name',
      authorBFF: 'author.bestFriend.name',
      publicationYear: 'publicationYear',
      media: 'image',
    },
    prepare(book, options = {}) {
      return Object.assign({}, book, {
        title:
          ((options.ordering || {}).name === 'swedishTitle' && (book.translations || {}).se) ||
          book.title,
        subtitle: formatSubtitle(book),
      })
    },
  },
  initialValue: {
    title: 'Foo',
  },
})

export const schema = {types: [authorType, bookType]}
