'use strict';

// import the natural library
const natural = require('natural');

const request = require('superagent');

const Bot = require('./Bot');

const weatherURL = `http://api.openweathermap.org/data/2.5/weather?&units=metric&appid=${process.env.WEATHER_API_KEY}&q=`;

let classifier;

natural.BayesClassifier.load('classifier.json', null, (err, clsfr) => {
  if (err) {
    throw err;
  }

  classifier = clsfr;
});

const bot = new Bot({
  token: process.env.SLACK_TOKEN,
  autoReconnect: true,
  autoMark: true
});

let inflector = natural.CountInflector;

bot.respondTo('what day is it', (message, channel) => {
  let date = new Date();

  // use the ECMAScript Internationalization API to convert
  // month numbers into names
  let locale = 'en-us';
  let month = date.toLocaleString(locale, { month: 'long' });
  bot.send(`It is the ${inflector.nth(date.getDate())} of ${month}.`, channel);
}, true);

let settings = {};

bot.respondTo('', (message, channel, user) => {
  // grab the command from the message's text
  let command = message.text.split(' ')[0];

  let distance = natural.LevenshteinDistance('weather', command);

  // our typo tolerance, a higher number means a larger string distance
  let tolerance = 2;

  // if the distance between the given command and 'weather' is only
  // 2 string distance, then that's considered close enough
  if (distance <= tolerance) {
    bot.send(`Looks like you were trying to get the weather, ${user.name}!`, channel);
  }
}, true);

bot.respondTo({ mention: true }, (message, channel, user) => {
  let args = getArgs(message.text);

  if (args[0] === 'set') {
    let place = args.slice(1).join(' ');
    settings[user.name] = place

    bot.send(`Okay ${user.name}, I've set ${place} as your default location`, channel);
    return;
  }

  if (args.indexOf('in') < 0 && !settings[user.name]) {
    bot.send(`Looks like you didn\'t specify a place name, you can set a city by sending \`@weatherbot set [city name]\` or by sending \`@weatherbot ${args.join(' ')} in [city name]\``, channel);
    return;
  }

  // The city is usually preceded by the word 'in'
  let city = args.indexOf('in') > 0 ? args.slice(args.indexOf('in') + 1) : settings[user.name];

  let option = classifier.classify(message.text).split(',');

  // Set the typing indicator as we're doing an asynchronous request
  bot.setTypingIndicator(channel);

  getWeather(city, (error, fullName, description, temperature, data) => {
    if (error) {
      bot.send(`Oops, an error occurred, please try again later!`, channel);
      return;
    }

    let response = '';

    switch(option[0]) {
      case 'weather':
        // rain is an optional variable
        let rain = data.rain ? `Rainfall in the last 3 hours has been ${data.rain['3h']} mm.` : ''

        let expression = data.clouds.all > 80 ? 'overcast' : (data.clouds.all < 25 ? 'almost completely clear' : 'patchy');
        // in case of 0 cloud cover
        expression = data.clouds.all === 0 ? 'clear skies' : expression;

        let clouds = `It's ${expression} with a cloud cover of ${data.clouds.all}%.`;

        response = `It is currently ${description} with a temperature of ${Math.round(temperature)} celsius in ${fullName}. The predicted high for today is ${Math.round(data.main.temp_max)} with a low of ${Math.round(data.main.temp_min)} celsius and ${data.main.humidity}% humidity. ${clouds} ${rain}`;
        break;

      case 'conditions':
        response = `${fullName} is experiencing ${description} right now.`;
        break;

      case 'temperature':
        let temp = Math.round(temperature);
        let flavorText = temp > 25 ? 'hot!' : (temp < 10 ? 'cold!' : 'nice!');

        response = `It's currently ${temp} degrees celsius in ${fullName}, that's ${flavorText}`;
    }

    bot.send(response, channel);
  });
});

function upper(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getWeather(location, callback) {
  // make an AJAX GET call to the Open Weather Map API
  request.get(weatherURL + location)
    .end((err, res) => {
      if (err) callback(err);
      let data = JSON.parse(res.text);

      if (data.cod === '404') {
        return callback(new Error('Sorry, I can\'t find that location!'));
      }

      console.log(data);

      let weather = [];
      data.weather.forEach((feature) => {
        weather.push(feature.description);
      });

      let condition = weather.join(' and ');

      callback(null, data.name, condition, data.main.temp, data);
    });
}

// Take the message text and return the arguments
function getArgs(msg) {
  return msg.split(' ').slice(1);
}
