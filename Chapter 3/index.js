'use strict';

const Bot = require('./Bot');
const request = require('superagent');

const wikiAPI = "https://en.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro=&explaintext=&titles="
const wikiURL = 'https://en.wikipedia.org/wiki/';

const bot = new Bot({
  token: process.env.SLACK_TOKEN,
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

bot.respondTo('roll', (message, channel, user) => {
  // get the members of the channel
  const members = bot.getMembersByChannel(channel);

  // make sure there actually members to interact with. If there
  // aren’t then it usually means that the command was given in a 
  // direct message
  if (!members) {
    bot.send('You have to challenge someone in a channel, not a direct message!', channel);
    return;
  }

  // get the arguments from the message body
  let args = getArgs(message.text);

  // the user shouldn't challenge themselves
  if (args.indexOf(user.name) > -1) {
    bot.send(`Challenging yourself is probably not the best use of your or my time, ${user.name}`, channel);
    return;
  }

  // if args is empty, return with a warning
  if (args.length < 1) {
    bot.send('You have to provide the name of the person you wish to challenge!', channel);
    return;
  }

  // does the opponent exist in this channel?
  if (members.indexOf(args[0]) < 0) {
    bot.send(`Sorry ${user.name}, but I either can't find ${args[0]} in this channel, or they are a bot!`, channel);
    return;
  }

  // Roll two random numbers between 0 and 100
  let firstRoll = Math.round(Math.random() * 100);
  let secondRoll = Math.round(Math.random() * 100);

  let challenger = user.name;
  let opponent = args[0];

  // reroll in the unlikely event that it's a tie
  while (firstRoll === secondRoll) {
    secondRoll = Math.round(Math.random() * 100);
  }

  let winner = firstRoll > secondRoll ? challenger : opponent;

  // Using new line characters (\n) to format our response
  bot.send(
    `${challenger} fancies their changes against ${opponent}!\n
${challenger} rolls: ${firstRoll}\n
${opponent} rolls: ${secondRoll}\n\n
*${winner} is the winner!*`
  , channel);

}, true);


// Take the message text and return the arguments
function getArgs(msg) {
  return msg.split(' ').slice(1);
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
