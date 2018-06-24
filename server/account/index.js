const {dirname} = require('path');
const Router = require('koa-router');
const request = require('superagent');

const debug = require('../../utils/debug')('user:account');
const render = require('../../utils/render');
const endpoints = require('../../utils/endpoints');

const password = require('./password');
const name = require('./name');
const mobile = require('./mobile');

const router = new Router();

// Show account setting
router.get('/', async (ctx, next) => {
  const errors = ctx.session.errors;
  const alert = ctx.session.alert;

  const resp = await request.get(endpoints.profile)
  .set('X-User-Id', ctx.session.user.id)

  const profile = resp.body;
  ctx.state.account = profile;
  ctx.state.errors = errors;
  ctx.state.alert = alert;
  
  ctx.body = await render('account.html', ctx.state);

  delete ctx.session.errors;
  delete ctx.session.alert;

});

router.use('/password', password);
router.use('/name', name);
router.use('/mobile', mobile);

module.exports = router.routes();