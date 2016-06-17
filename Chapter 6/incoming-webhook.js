'use strict';

const WEBHOOK_URL = 'https://hooks.slack.com/services/T00000001/B00000001/xxxxxxxxxxxxxxxxxxxxxxxx';

const request = require('superagent');

request
  .post(WEBHOOK_URL)
  .send({
    username: "Incoming bot",
    icon_emoji: ":+1:",
    text: 'Hello! Here is a fun link: <http://www.github.com|Github is great!>'
  })
  .end((err, res) => {
    console.log(res);
  });

