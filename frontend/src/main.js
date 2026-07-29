import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import './style.css';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './store/auth';

async function bootstrap() {
  const pinia = createPinia();
  setActivePinia(pinia);

  // Must resolve before the router's first navigation guard check, or a
  // valid persisted Electron session would still bounce to /login on the
  // very first paint (the guard would see isAuthenticated=false).
  const auth = useAuthStore();
  await auth.restoreSession();

  createApp(App).use(pinia).use(router).mount('#app');
}

bootstrap();
