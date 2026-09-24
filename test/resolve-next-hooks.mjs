export async function resolve(specifier, context, next) {
  if (/^next\/[^/]+$/.test(specifier)) {
    try {
      return await next(specifier, context)
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
      return next(`${specifier}.js`, context)
    }
  }
  return next(specifier, context)
}
