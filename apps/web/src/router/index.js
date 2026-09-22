import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import WorkbenchView from '../views/WorkbenchView.vue';
import CaseDetailView from '../views/CaseDetailView.vue';
import LandingView from '../views/LandingView.vue';
import FunnelView from '../views/FunnelView.vue';
import ContentPageView from '../views/ContentPageView.vue';
import RedirectView from '../views/RedirectView.vue';
import ConversionView from '../views/ConversionView.vue';
import GrowthAdminView from '../views/GrowthAdminView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/', component: WorkbenchView, meta: { auth: true } },
    { path: '/cases/:id', component: CaseDetailView, meta: { auth: true } },
    { path: '/admin/funnel', component: FunnelView, meta: { auth: true, funnel: true } },
    { path: '/admin/conversion', component: ConversionView, meta: { auth: true, funnel: true } },
    { path: '/admin/growth', component: GrowthAdminView, meta: { auth: true, funnel: true } },
    { path: '/p/:product', component: LandingView },
    { path: '/c/:slug', component: ContentPageView },
    { path: '/pages/:slug', component: ContentPageView },
    { path: '/r/:code', component: RedirectView },
    { path: '/landing/ticket-grab', redirect: '/p/ticket-grab' },
    { path: '/landing/usgate', redirect: '/p/usgate' },
  ],
});

router.beforeEach((to) => {
  const token = localStorage.getItem('salesos_token');
  if (to.meta.auth && !token) return '/login';
  if (to.path === '/login' && token) return '/';
  if (to.meta.funnel) {
    try {
      const u = JSON.parse(localStorage.getItem('salesos_user') || '{}');
      if (!['admin', 'supervisor', 'viewer'].includes(u.role)) return '/';
    } catch {
      return '/';
    }
  }
});

export default router;
