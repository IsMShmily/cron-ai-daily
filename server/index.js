/**
 * Crontab Manager - 本地定时任务管理服务（Koa）
 * 仅监听 localhost，操作当前用户 crontab
 */

const Koa = require('koa');
const cors = require('@koa/cors');
const bodyParser = require('koa-bodyparser');
const serve = require('koa-static');
const path = require('path');
const fs = require('fs');
const apiRouter = require('./routes/jobs');

const PORT = process.env.PORT || 3846;
const app = new Koa();

app.use(cors({ origin: true }));
app.use(bodyParser());

app.use(apiRouter.routes()).use(apiRouter.allowedMethods());

// 可选：生产时托管前端静态文件
const webDist = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(serve(webDist));
  app.use((ctx) => {
    if (ctx.path.startsWith('/api') || ctx.body != null) return;
    ctx.type = 'html';
    ctx.body = fs.createReadStream(path.join(webDist, 'index.html'));
  });
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Crontab Manager: http://127.0.0.1:${PORT}`);
  console.log('API: GET/POST /api/jobs, PUT/DELETE /api/jobs/:id, POST /api/sync');
});
