const debug = require('debug')('user:index');
const path = require('path');
const Koa = require('koa');
const Router = require('koa-router');
const logger = require('koa-logger');
const bodyParser = require('koa-bodyparser');
const session = require('koa-session');

const checkLogin = require('./middlewares/check-login');
const handleErrors = require('./middlewares/handle-errors');
const inlineMin = require('./middlewares/inline-min');

const signup = require('./server/signup');
const login = require('./server/login');
const settings = require('./server/settings');
const logout = require('./server/logout');

const fetchAccess = require('./utils/fetch-access');

const app = new Koa();
const router = new Router();

app.proxy = true;
app.keys = ['SEKRIT1', 'SEKRIT2'];

app.use(logger());

if (process.env.NODE_ENV !== 'production') {
  const static = require('koa-static');
  app.use(static(path.resolve(process.cwd(), 'node_modules')));
  app.use(static(path.resolve(process.cwd(), 'client')));
}

app.use(async function (ctx, next) {
  ctx.state.env = {
    isProduction: process.env.NODE_ENV === 'production',
    year: new Date().getFullYear()
  };
  debug(ctx.state.env);

  await next();
});

app.use(inlineMin());
app.use(session(app));
app.use(checkLogin());
app.use(handleErrors());
app.use(bodyParser());

router.use('/signup', signup);
// singup/check-username
// singup/check-email
// Response 403 Forbidden if name is taken
// Submit as form-data
router.use('/login', login);
// router.use('/password-reset');
router.use('/logout', logout);
router.use('/settings', settings);

app.use(router.routes());

/**
 * @param {Koa} app - a Koa instance
 */
async function bootUp(app) {
  const appName = 'next-myft';
  debug('booting %s', appName);

  const port = process.env.PORT || 3000;

  try {
    app.context.accessData = await fetchAccess();
  } catch (e) {
    debug("Get access token error: %O", e)
  }

  // Create HTTP server
  const server = app.listen(port);

  // Logging server error.
  server.on('error', (error) => {
    debug(`Server error: %O`, error);
  });

  // Listening event handler
  server.on('listening', () => {
    debug(`${appName} running on %o`, server.address());
  });
}

bootUp(app)
  .catch(err => {
    debug('Bootup error: %O', err);
  });
