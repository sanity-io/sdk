# Debugging with Environment Variables

The SDK supports zero-config logging via the `DEBUG` environment variable, making it easy to troubleshoot issues without modifying your code.

## Quick Start

Simply set the `DEBUG` environment variable when running your application:

```bash
# Enable all SDK logging at debug level
DEBUG=sanity:* npm start

# Or with your app
DEBUG=sanity:* node my-app.js
```

## Patterns

### All Namespaces

```bash
# Enable all SDK logs at debug level
DEBUG=sanity:*

# Enable all SDK logs at trace level (very verbose)
DEBUG=sanity:trace:*
```

### Specific Namespaces

```bash
# Enable specific namespaces
DEBUG=sanity:auth,sanity:document

# Multiple specific namespaces with different levels
DEBUG=sanity:trace:auth,sanity:debug:document
```

### Internal Logs

For SDK maintainers debugging internal operations:

```bash
# Enable internal/maintainer logs (includes RxJS streams, store internals)
DEBUG=sanity:*:internal

# Trace level with internal logs
DEBUG=sanity:trace:*:internal
```

## Available Namespaces

The following namespaces are available (more are added as logging is instrumented):

- `sdk` - SDK initialization, configuration, and lifecycle
- `auth` - Authentication and authorization
- `document` - Document operations
- `query` - Query execution
- `store` - Store operations (mostly internal)

## Combining with Other Debug Patterns

The SDK respects the `DEBUG` environment variable convention used by many tools:

```bash
# Enable both SDK and other library debugging
DEBUG=sanity:*,express:* npm start
```

## For Support Teams

When helping users debug issues, you can ask them to:

1. Set the DEBUG environment variable:

   ```bash
   DEBUG=sanity:* npm start
   ```

2. Reproduce the issue

3. Share the console output

No code changes required!

## Production Considerations

By default, logging is **disabled in production** (when `NODE_ENV=production`) even if `DEBUG` is set.

To enable logging in production, you must use programmatic configuration:

```typescript
import {configureLogging} from '@sanity/sdk'

configureLogging({
  level: 'info',
  namespaces: ['*'],
  enableInProduction: true,
})
```

## Advanced Usage

For more control (custom handlers, dynamic configuration), see the `configureLogging` API documentation in the SDK reference.
