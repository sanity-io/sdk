import {Avatar, Box, Text} from '@sanity/ui'
import {type JSX, useState} from 'react'

interface FallbackAvatarProps {
  src?: string
  size: React.ComponentProps<typeof Avatar>['size']
  displayName: string
}

function generateInitials(displayName: string): string {
  if (!displayName || displayName.trim() === '') {
    return '?'
  }

  // Split by whitespace and filter out empty strings
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)

  if (words.length === 0) {
    return '?'
  }

  // Use Array.from to properly handle Unicode characters, emojis, etc.
  const initials = words
    .slice(0, 2) // Take only first 2 words
    .map((word) => {
      const chars = Array.from(word)
      return chars.length > 0 ? chars[0] : ''
    })
    .filter((char) => char !== '') // Remove any empty characters
    .join('')
    .toUpperCase()

  return initials || '?'
}

export function FallbackAvatar({src, size, displayName}: FallbackAvatarProps): JSX.Element {
  const [imageError, setImageError] = useState(false)
  const initials = generateInitials(displayName)

  // Don't try to render if src is missing, empty, or only whitespace, or if image failed to load
  if (imageError || !src || src.trim() === '') {
    // Create a fallback that matches Avatar's visual style
    return (
      <Box
        style={{
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: '50%',
          backgroundColor: '#e1e3e9',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        title={displayName}
      >
        <Text
          size={size !== undefined && size >= 2 ? 3 : 2}
          weight="semibold"
          style={{
            color: '#6e7683',
            lineHeight: 1,
          }}
        >
          {initials}
        </Text>
      </Box>
    )
  }

  return <Avatar size={size} src={src} title={displayName} onError={() => setImageError(true)} />
}
