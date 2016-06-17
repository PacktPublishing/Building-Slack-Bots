'use strict';

const Bot = require('./Bot');

const wikiAPI = 'https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=&explaintext=&titles=';
const wikiURL = 'https://en.wikipedia.org/wiki/';

const request = require('superagent');
const express = require('express');

const app = express();

const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';

app.get('/', (req, res) => {
  res.redirect(`https://slack.com/oauth/authorize?client_id=${CLIENT_ID}&scope=bot&redirect_uri=${escape('http://[YOUR_REDIRECT_URI]/bot')}`);
});

app.get('/bot', (req, res) => {
  let code = req.query.code;

  request
    .get(`https://slack.com/api/oauth.access?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&redirect_uri=${escape('http://[YOUR_REDIRECT_URI]/bot')}`)
    .end((err, result) => {
      if (err) {
        console.log(err);
        return res.send('An error occured! Please try again later');
      }
      console.log(res.body);

      let botToken = result.body.bot.bot_access_token;
      console.log('Got the token:', botToken);

      startWikibot(result.body.bot.bot_access_token);

      res.send('You have successfully installed Wikibot! You can now start using it in your Slack team, but make sure to invite the bot to your channel first with the /invite command!');
    });
});

app.listen(8080, () => {
  console.log('listening');
});

function startWikibot(token) {
  const bot = new Bot({
    token: token,
    autoReconnect: true,
    autoMark: true
  });

  bot.respondTo('hello', (message, channel, user) => {
    channel.send(`Hello to you too, ${user.name}!`)
  }, true);

  // Take the message text and return the arguments
  function getArgs(msg) {
    return msg.split(' ').slice(1);
  }

  function getWikiSummary(term, cb) {
    // replace spaces with unicode
    let parameters = term.replace(/ /g, '%20');

    request
      .get(wikiAPI + parameters)
      .end((err, res) => {
        if (err) {
          cb(err);
          return;
        }

        let url = wikiURL + parameters;

        cb(null, JSON.parse(res.text), url);
      });
  }

  bot.respondTo('help', (message, channel) => {  
    bot.send(`To use my Wikipedia functionality, type \`wiki\` followed by your search query`, channel); 
  }, true);

  bot.respondTo('wiki', (message, channel, user) => {
    if (user && user.is_bot) {
      return;
    }

    // grab the search parameters, but remove the command 'wiki' from the beginning
    // of the message first
    let args = message.text.split(' ').slice(1).join(' ');

    // if there are no arguments, return
    if (args.length < 1) {
      bot.send('I\'m sorry, but you need to provide a search query!', channel);
      return;
    }

    // set the typing indicator before we start the wikimedia request
    // the typing indicator will be removed once a message is sent
    bot.setTypingIndicator(message.channel);

    getWikiSummary(args, (err, result, url) => {
      if (err) {
        bot.send(`I\'m sorry, but something went wrong with your query`, channel);
        console.error(err);
        return;
      }

      let pageID = Object.keys(result.query.pages)[0];

      // -1 indicates that the article doesn't exist
      if (parseInt(pageID, 10) === -1) {
        bot.send('That page does not exist yet, perhaps you\'d like to create it:', channel);
        bot.send(url, channel);
        return;
      }

      let page = result.query.pages[pageID];
      let summary = page.extract;

      if (/may refer to/i.test(summary)) {
        bot.send('Your search query may refer to multiple things, please be more specific or visit:', channel);
        bot.send(url, channel);
        return;
      }

      if (summary !== '') {
        bot.send(url, channel);

        let paragraphs = summary.split('\n');

        paragraphs.forEach((paragraph) => {
          if (paragraph !== '') {
            bot.send(`> ${paragraph}`, channel);
          }
        });
      } else {
        bot.send('I\'m sorry, I couldn\'t find anything on that subject. Try another one!', channel);
      }
    });
  }, true);
}
