import { createRouter, createWebHistory } from 'vue-router'
import BcaView from '../views/BcaView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'bca',
      component: BcaView
    }
  ]
})

export default router