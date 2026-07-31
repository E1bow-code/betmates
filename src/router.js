// Minimal hash router: '#/' -> races list, '#/race/:id' -> race detail.

export function initRouter(routes, onChange) {
  function resolve() {
    const hash = location.hash.replace(/^#\/?/, '')
    const [segment, param] = hash.split('/')
    const route = routes[segment || ''] ?? routes['404']
    onChange(route, param)
  }
  window.addEventListener('hashchange', resolve)
  resolve()
}

export function navigate(path) {
  location.hash = path
}
