import './style.css'
import { initRouter } from './router.js'
import { renderRaceList } from './views/raceList.js'
import { renderRaceDetail } from './views/raceDetail.js'

const app = document.getElementById('app')

initRouter(
  {
    '': () => renderRaceList(app),
    race: (param) => renderRaceDetail(app, param),
    404: () => {
      app.innerHTML = `<div class="empty">Page not found. <a href="#/">Go home</a></div>`
    }
  },
  (route, param) => route(param)
)
