const test = require('ava');
const reset = require('../utils/reset-password');

test('reset', async t => {
  const address = "neefrankie@outlook.com";

  const code = await reset.generateCode();
  console.log('Random code: %s', code);

  const info = await reset.sendEmail({
    code,
    name: "Weiguo Ni",
    address
  });
  console.log('Email sent: %s', info.messageId);

  reset.store({code, address});

  const email = await reset.load(code);
  console.log("Email: %s", email);

  t.pass('reset email workflow');
});