import {requester as baseSanityRequester} from '@sanity/client'

// Track request timings per middleware context
const requestTimings = new WeakMap<object, number>()

// Clone the base requester and attach middleware using hook event signatures
export const networkTimingInterceptor = baseSanityRequester.clone().use({
  interceptRequest: (prev, {context}) => {
    requestTimings.set(context, performance.now())
    // eslint-disable-next-line no-console
    console.log('[sanity] interceptRequest context', context)

    // return {
    //   url,
    //   method,
    //   body: [{ displayName: "intercepted", id: "123" }],
    //   headers: {},
    //   statusCode: 200,
    //   statusMessage: "OK",
    // };
    return prev
  },
  onError: (error, context) => {
    const start = requestTimings.get(context)
    if (typeof start === 'number') {
      const ms = performance.now() - start
      // eslint-disable-next-line no-console
      console.log(`[sanity] timing error: ${ms.toFixed(1)}ms`)
      requestTimings.delete(context)
    }
    return error
  },
  onResponse: (response, context) => {
    const start = requestTimings.get(context)
    let ms = 0
    if (typeof start === 'number') {
      ms = performance.now() - start
      // eslint-disable-next-line no-console
      console.log(`[sanity] timing: ${ms.toFixed(1)}ms ${response.url} ${response.method}`)
      requestTimings.delete(context)
    }
    response.headers = {
      ...response.headers,
      'x-middleware-timing': `${ms.toFixed(1)}ms`,
    }
    return response
  },
})
