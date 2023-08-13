import * as Vue from 'vue'
import App from './App.vue'
import routes from './routes'
import * as VueRouter from 'vue-router'

const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes
});

let app = Vue.createApp(App);
app.use(router);
app.mount('#app');
