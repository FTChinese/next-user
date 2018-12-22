const request = require('superagent');
const Router = require('koa-router');
const path = require('path');
const schema = require('../schema');

const debug = require('../../util/debug')('user:profile');
const endpoints = require('../../util/endpoints');
const {processJoiError, processApiError, buildAlertDone} = require('../../util/errors');

const router = new Router();

router.post('/', async (ctx) => {

  const redirectTo = path.resolve(ctx.path, '../');

  const result = schema.mobile.validate(ctx.request.body.account);

  if (result.error) {
    ctx.session.errors = processJoiError(result.error)

    return ctx.redirect(redirectTo);
  }

  /**
   * @type {{mobile: string}}
   */
  const account = result.value;

  try {

    const userId = ctx.session.user.id;

    await request.patch(endpoints.mobile)
      .set('X-User-Id', userId)
      .send(account);

    ctx.session.alert = buildAlertDone('mobile_saved');

    return ctx.redirect(redirectTo);
    
  } catch (e) {

    ctx.session.errors = processApiError(e);

    return ctx.redirect(redirectTo);
  }
});

module.exports = router.routes();