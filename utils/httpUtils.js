const http = require('http');
const https = require('https');
const url = require('url');

const packageJson = require('../package.json');
const { ConsoleTransportOptions } = require('winston/lib/winston/transports');

const userAgent = 'NodeJSClient/' + packageJson.version;

function getDefaultHeaders(sdkKey, config) {
  // Use lowercase header names for convenience in our test code, where we may be checking for headers in a
  // real HTTP request that will be lowercased by the request API
  const ret = {
    authorization: sdkKey,
    'user-agent': userAgent,
  };
  if (config.wrapperName) {
    ret['x-launchdarkly-wrapper'] = config.wrapperVersion
      ? config.wrapperName + '/' + config.wrapperVersion
      : config.wrapperName;
  }
  return ret;
}

// Convenience wrapper for making an HTTP/HTTPS request via Node's standard modules. Unlike http.request,
// the callback takes (error, response, body) parameters instead of just (response).
function httpRequest(requestUrl, options, body, config, callback) {
  // Note: https.request allows a url parameter to be passed separately from options, but only in v10.9.0+, so
  // we still have to parse the URL until our minimum Node version is increased.
  const urlOpts = url.parse(requestUrl);
  //const isSecure = urlOpts.protocol === 'https:';
  const allOptions = Object.assign(
    {},
    config && config.tlsParams,
    urlOpts,
    {
      timeout: config && config.timeout ? config.timeout * 1000 : undefined,
      agent: config && config.proxyAgent,
    },
    options
  );
  config.logger && config.logger.debug(requestUrl);
  config.logger && config.logger.debug(allOptions);
  allOptions.body = body
  const resp = fetch(requestUrl, allOptions)
  config.logger.debug(resp);
  resp.then(result => {
    config.logger.debug(result);
    callback(null, result)
  }).catch(err => {
    config.logger.debug(err);
    callback(err, null)
  })
  // (isSecure ? https : http).request(allOptions, resp => {
  //   let body = '';
  //   resp.on('data', chunk => {
  //     body += chunk;
  //   });
  //   resp.on('end', () => {
  //     callback(null, resp, body);
  //   });
  // });
  // req.on('error', err => {
  //   callback(err);
  // });
  // if (body !== null && body !== undefined) {
  //   req.write(body);
  // }
  // req.end();
}

// Creates an in-memory etag cache and returns a wrapper for httpRequest that uses the cache. This is a
// naive implementation that does not place a bound on the cache; the SDK will normally always be hitting
// the same URL (the only time we don't is if we get an "indirect/put" stream event, but in that case we
// deliberately do not use the cache).
function httpWithETagCache() {
  const cache = {};
  return (requestUrl, options, body, config, callback) => {
    const cacheEntry = cache[requestUrl];
    const cachedEtag = cacheEntry && cacheEntry.etag;
    let newOptions = options;
    if (cachedEtag) {
      const newHeaders = Object.assign({}, options && options.headers, { 'if-none-match': cachedEtag });
      newOptions = Object.assign({}, options, { headers: newHeaders });
    }
    newOptions.body = body
    const getResp = fetch(requestUrl, newOptions)
    getResp.then((resp) => {
      if (resp.status === 304 && cacheEntry) {
        return callback(null, resp, cacheEntry.body);
      } else {
        if (resp.headers['etag']) {
          const respBody = resp.json()
          cache[requestUrl] = { etag: resp.headers['etag'], respBody };
        }
        const body = resp.json()
        return callback(null, resp, body);
      }
    }).catch((err) => {
      return callback(err)
    })
    }
}

module.exports = {
  getDefaultHeaders,
  httpRequest,
  httpWithETagCache,
};
