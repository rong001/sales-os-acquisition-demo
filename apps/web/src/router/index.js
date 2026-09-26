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
import BossView from '../views/BossView.vue';
import PoolRulesView from '../views/PoolRulesView.vue';
import DialTasksView from '../views/DialTasksView.vue';
import ScriptsView from '../views/ScriptsView.vue';
import ImportView from '../views/ImportView.vue';
import WecomSidepanelView from '../views/WecomSidepanelView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/', component: WorkbenchView, meta: { auth: true } },
    { path: '/cases/:id', component: CaseDetailView, meta: { auth: true } },
    { path: '/boss', component: BossView, meta: { auth: true, boss: true } },
    { path: '/pool', component: PoolRulesView, meta: { auth: true } },
    { path: '/dial', component: DialTasksView, meta: { auth: true } },
    { path: '/scripts', component: ScriptsView, meta: { auth: true } },
    { path: '/import', component: ImportView, meta: { auth: true } },
    { path: '/wecom/sidepanel', component: WecomSidepanelView, meta: { auth: true } },
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
  if (to.meta.funnel || to.meta.boss) {
    try {
      const u = JSON.parse(localStorage.getItem('salesos_user') || '{}');
      if (!['admin', 'supervisor', 'viewer'].includes(u.role)) return '/';
    } catch {
      return '/';
    }
  }
});

export default router;
