/**
 * The fields to check for a title.
 * The order of the items in the array defines the priority.
 *
 * @internal
 */
export const TITLE_CANDIDATES = ['title', 'name', 'label', 'heading', 'header', 'caption']

/**
 * The fields to check for a subtitle.
 * The order of the items in the array defines the priority.
 *
 * @internal
 */
export const SUBTITLE_CANDIDATES = ['description', 'subtitle', ...TITLE_CANDIDATES]

/**
 * Generates a GROQ projection for preview data without requiring a schema.
 * Uses common field names to make educated guesses about which fields to use.
 *
 * @internal
 */
export const PREVIEW_PROJECTION = `{
  // Get all potential title fields
  "titleCandidates": {
    ${TITLE_CANDIDATES.map((field) => `"${field}": ${field}`).join(',\n      ')}
  },
  // Get all potential subtitle fields
  "subtitleCandidates": {
    ${SUBTITLE_CANDIDATES.map((field) => `"${field}": ${field}`).join(',\n      ')}
  },
  "media": coalesce(
    select(
      defined(asset) => {"type": "image-asset", "_ref": asset._ref},
      defined(image.asset) => {"type": "image-asset", "_ref": image.asset._ref},
      defined(mainImage.asset) => {"type": "image-asset", "_ref": mainImage.asset._ref},
      null
    )
  ),
  _type,
  _id,
  _updatedAt
}`
