import * as Vue from 'vue'
import App from './App.vue'
import routes from './routes'
import { Button, Field, CellGroup  } from 'vant';
import * as VueRouter from 'vue-router'

import 'vant/lib/index.css';

// https://vant-contrib.gitee.io/vant/#/en-US/quickstart
const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes
});

let app = Vue.createApp(App);
app.use(router);

app.use(Button);
app.use(Field);
app.use(CellGroup);

app.mount('#app');
