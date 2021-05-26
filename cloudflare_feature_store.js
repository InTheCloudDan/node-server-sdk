const CachingStoreWrapper = require('launchdarkly-node-server-sdk/caching_store_wrapper')
const NodeCache = require('node-cache')
const noop = function() {}

var defaultCacheTTLSeconds = 15

const kvStore = function CloudFlareKVFeatureStore(storeNameTest, options) {
  var ttl = options && options.cacheTTL
  if (ttl === null || ttl === undefined) {
    ttl = defaultCacheTTLSeconds
  }
  return new CachingStoreWrapper(
    new cfFeatureStoreInternal(storeNameTest, options),
    ttl,
  )
}

function cfFeatureStoreInternal(storeName, options) {
  const cache = new NodeCache({ stdTTL: 30 })
  options = options || {}
  const store = {}
  const prefix = options.prefix || ''
  const fullPrefix = kind => {
    return prefix ? `${prefix}:${kind}:` : `${kind}:`
  }

  store.getInternal = (kind, key, maybeCallback) => {
    const cb = maybeCallback || noop
    const findKey = key
    const kindData = cache.get(kind.namespace)
    if (kindData == undefined) {
      storeName.get('featureData').then(item => {
        const parseData = JSON.parse(item)
        cache.set('features', parseData['features'])
        cache.set('segments', parseData['segments'])
        cb(parseData[kind.namespace][key])
      })
    } else {
      console.log(`data: ${kindData[key]}`)
      cb(kindData[key])
    }
  }

  store.getAllInternal = (kind, maybeCallback) => {
    const cb = maybeCallback || noop
    const results = {}
    const kindData = cache.get(kind.namespace)
    console.log(`cache key:  ${kindData}`)
    console.log(kind.namespace)
    if (kindData == undefined) {
      storeName.get('featureData').then(item => {
        const parseData = JSON.parse(item)
        cache.set('features', parseData['features'])
        cache.set('segments', parseData['segments'])
        cb(parseData[kind.namespace])
      })
    } else {
      cb(kindData)
    }
  }

  async function getFlags(flagKeys, results) {
    for (var i = 0; i < flagKeys.length; i++) {
      const foundFlag = await storeName.get(flagKeys[i].name)
      const parsedFlag = JSON.parse(foundFlag)
      results[parsedFlag.key] = parsedFlag
    }
  }

  // store.initOrderedInternal = (collection, cb) => {
  //   insertKind(collection).then(() => {
  //     (function() { cb && cb(); })();
  //   })
  // }

  store.initInternal = async (allData, cb) => {
    await insertKindAll(allData).then(() => {
      console.log('data inserted')(function() {
        cb && cb()
      })()
    })
  }

  store.upsertInternal = (kind, item, cb) => {
    const itemKey = `${fullPrefix(kind)}${key}`
    storeName.put(itemKey, item)
  }

  async function insertKindAll(allData) {
    console.log('inserting data')
    storeName.put('featureData', JSON.stringify(allData))
    console.log('after insert')
  }

  async function insertKind(collection) {
    //for (const kindNamespace in collection) {
    //console.log(collection)
    //if (Object.hasOwnProperty.call(allData, kindNamespace)) {
    const items = collection
    for (const item in items) {
      const namespace = items[item]
      for (const entry in namespace.items) {
        const entryVal = namespace.Items[entry]
        //console.log(entryVal)
        const itemKey = `${fullPrefix(namespace.kind.namespace)}${entryVal.key}`
        console.log(itemKey)
        storeName.put(itemKey, JSON.stringify(entryVal), {
          metadata: { version: entryVal.version },
        })
      }
      //if (Object.hasOwnProperty.call(items, key)) {

      //}
    }
    //}
    //}
  }
  store.initializedInternal = maybeCallback => {
    const cb = maybeCallback || noop
    // Needs real logic
    storeName.get(initedKey, (err, obj) => {
      cb(true)
    })
  }

  // KV Binding is done outside of the application logic.
  store.close = () => {}

  return store
}

module.exports = {
  CloudFlareKVFeatureStore: kvStore,
}
