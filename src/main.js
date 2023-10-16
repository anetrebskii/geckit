import * as Vue from 'vue'
import App from './App.vue'
import routes from './routes'
import { Button, Field, CellGroup, Space, Row, RowJustify, Col  } from 'vant';
import * as VueRouter from 'vue-router'

import 'vant/lib/index.css';
import './assets/index.css';

// https://vant-contrib.gitee.io/vant/#/en-US/quickstart
const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes
});

let app = Vue.createApp(App);
app.use(router);
app.use(Space)

app.use(Row);
app.use(RowJustify);
app.use(Col);
app.use(Button);
app.use(Field);
app.use(CellGroup);

app.mount('#app');
