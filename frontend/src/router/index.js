import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../store/auth';

import DashboardView from '../views/DashboardView.vue';
import MyTasksView from '../views/MyTasksView.vue';
import TaskDetailView from '../views/TaskDetailView.vue';
import LoginView from '../views/LoginView.vue';
import SignupView from '../views/SignupView.vue';
import VerifyEmailView from '../views/VerifyEmailView.vue';
import ForgotPasswordView from '../views/ForgotPasswordView.vue';
import ResetPasswordView from '../views/ResetPasswordView.vue';

const routes = [
  { path: '/', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
  { path: '/my-tasks', name: 'my-tasks', component: MyTasksView, meta: { requiresAuth: true } },
  { path: '/tasks/:id', name: 'task-detail', component: TaskDetailView, meta: { requiresAuth: true } },
  { path: '/login', name: 'login', component: LoginView },
  { path: '/signup', name: 'signup', component: SignupView },
  { path: '/verify-email', name: 'verify-email', component: VerifyEmailView },
  { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordView },
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
