import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', component: () => import('../views/Dashboard.vue') },
  { path: '/historicos', component: () => import('../views/Historicos.vue') },
  { path: '/config', component: () => import('../views/Config.vue') }
]

export default createRouter({
  history: createWebHistory(),
  routes
})
