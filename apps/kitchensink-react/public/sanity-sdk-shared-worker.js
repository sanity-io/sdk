/*
 * SharedWorker script for kitchensink app testing.
 * Performs fetch based on incoming request payloads and posts result back.
 */

// eslint-disable-next-line no-restricted-globals
onconnect = function (event) {
  var port = event.ports[0]

  port.onmessage = async function (e) {
    var data = e.data || {}
    var id = data.id
    var req = data.request || {}
    var context = req.context || {}
    var url = context.options.url
    var method = context.options.method || 'GET'
    var headers = context.options.headers || {}
    var body = context.options.body
    console.log('context', context, url, method, headers, body)

    try {
      // eslint-disable-next-line no-console
      console.log('[sanity] shared worker received', {
        id: id,
        url: url,
        method: method,
        hasContext: !!req.context,
      })
    } catch (err) {}

    // If no url provided, just log the context for debugging
    if (!url) {
      try {
        // eslint-disable-next-line no-console
        console.log('[sanity] No url provided. Shared worker context', req.context)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[sanity] shared worker log failed', err)
      }
      return
    }

    try {
      var fetchOptions = {method: method, headers: headers, mode: 'cors', redirect: 'follow'}
      if (req && typeof req.credentials === 'string') {
        fetchOptions.credentials = req.credentials
      }
      if (body != null) {
        var lowerHeaderKeys = {}
        try {
          for (var k in headers) {
            if (Object.prototype.hasOwnProperty.call(headers, k)) {
              lowerHeaderKeys[String(k).toLowerCase()] = headers[k]
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log('error parsing headers', err)
        }

        var isPlainObject =
          typeof body === 'object' &&
          body !== null &&
          !(body instanceof ArrayBuffer) &&
          !(body instanceof Blob) &&
          !(body instanceof FormData) &&
          !(body instanceof URLSearchParams)

        if (isPlainObject) {
          if (!('content-type' in lowerHeaderKeys)) {
            fetchOptions.headers = Object.assign({}, headers, {'content-type': 'application/json'})
          }
          fetchOptions.body = JSON.stringify(body)
        } else {
          fetchOptions.body = body
        }
      }

      // eslint-disable-next-line no-console
      console.log('fetching', url, fetchOptions)

      var res = await fetch(url, fetchOptions)
      console.log('res', res)
      var resHeadersObj = {}
      try {
        res.headers.forEach(function (value, key) {
          resHeadersObj[key] = value
        })
      } catch (err) {}

      var contentType = (res.headers && res.headers.get && res.headers.get('content-type')) || ''
      var responseBody = null
      try {
        if (typeof contentType === 'string' && contentType.indexOf('application/json') !== -1) {
          try {
            responseBody = await res.json()
          } catch (err) {
            responseBody = await res.text()
          }
        } else {
          responseBody = await res.text()
        }
      } catch (err) {
        responseBody = null
      }

      // Mark responses as coming from the shared worker
      try {
        resHeadersObj['x-from-shared-worker'] = '1'
      } catch (err) {}

      var response = {
        url: url,
        method: method,
        headers: resHeadersObj || {},
        body: responseBody,
        statusCode: res.status,
        statusMessage: res.statusText,
      }

      if (id) {
        try {
          // eslint-disable-next-line no-console
          console.log('[sanity] shared worker responding', {id: id, status: response.statusCode})
        } catch (err) {}
        port.postMessage({type: 'interceptResponse', id: id, response: response})
      } else {
        // eslint-disable-next-line no-console
        console.log('[sanity] shared worker fetch response', response)
        port.postMessage({type: 'interceptResponse', response: response})
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log('error', err)
      if (id) {
        port.postMessage({
          type: 'interceptResponse',
          id: id,
          response: null,
          error: (err && err.message) || String(err),
        })
      } else {
        // eslint-disable-next-line no-console
        console.warn('[sanity] shared worker fetch failed', err)
      }
    }
  }

  port.start()
}
