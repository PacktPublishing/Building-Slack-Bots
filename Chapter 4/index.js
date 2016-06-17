'use strict';

const redis = require('redis');
const Bot = require('./Bot');

const client = redis.createClient();

const bot = new Bot({
  token: process.env.SLACK_TOKEN,
  autoReconnect: true,
  autoMark: true
});

client.on('error', (err) => {
    console.log('Error ' + err);
});

client.on('connect', () => {
  console.log('Connected to Redis!');
});

// Take the message text and return the arguments
function getArgs(msg) {
  return msg.split(' ').slice(1);
}

let obj = {
  foo: 'bar',
  baz: {
    foobar: 'bazfoo'
  }
};

function stringifyNestedObjects(obj) {
  for (let k in obj) {
    if (obj[k] instanceof Object) {
      obj[k] = JSON.stringify(obj[k]);  
    }
  }

  return obj;
}

function parseNestedObjects(obj) {
  for (let k in obj) {
    if (typeof obj[k] === 'string' || obj[k] instanceof String) {
      try {
        obj[k] = JSON.parse(obj[k]);
      } catch(e) {
        // string wasn't a stringified object, so fail silently
      }      
    }
  }

  return obj;
}

// set hash
client.hmset('obj', stringifyNestedObjects(obj));

// retrieve hash
client.hgetall('obj', (err, object) => {
  console.log(parseNestedObjects(object));
});

client.del('heroes');

// set list
client.rpush('heroes', ['batman', 'superman', 'spider-man']);

// retrieve list
client.lrange('heroes', 0, -1, (err, list) => {
  console.log(list);
});

// store set
client.sadd('fruits', ['apples', 'bananas', 'oranges']);
client.sadd('fruits', 'bananas');

// retrieve set
client.smembers('fruits', (err, set) => {
  console.log(set);
});

// store sorted set
client.zadd('scores', [3, 'paul', 2, 'caitlin', 1, 'alex']);

client.zrange('scores', 0, -1, (err, set) => {
  console.log(set);
});

client.zrevrange('scores', 0, -1, 'withscores', (err, set) => {
  console.log(set);

  let arr = [];
  for (let i = 0; i < set.length; i++) {
    arr.push([set[i], set[i + 1]]);
    i++;
  }
  console.log(arr);
})

bot.respondTo('store', (message, channel, user) => {
  let args = getArgs(message.text);

  let key = args.shift();
  let value = args.join(' ');

  client.set(key, value, (err) => {
    if (err) {
      bot.send('Oops! I tried to store something but something went wrong :(', channel);
    } else {
      bot.send(`Okay ${user.name}, I will remember that for you.`, channel);
    }
  });
}, true);

bot.respondTo('retrieve', (message, channel, user) => {
  bot.setTypingIndicator(message.channel);

  let key = getArgs(message.text).shift();

  client.get(key, (err, reply) => {
    if (err) {
     console.log(err);
     bot.send('Oops! I tried to retrieve something but something went wrong :(', channel);
     return;
    }

    bot.send('Here\'s what I remember: ' + reply, channel);
  });
});

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

  // if args is empty, return with a warning
  if (args.length < 1) {
    bot.send('You have to provide the name of the person you wish to challenge!', channel);
    return;
  }

  // the user shouldn't challenge themselves
  if (args.indexOf(user.name) > -1) {
    bot.send(`Challenging yourself is probably not the best use of your or my time, ${user.name}`, channel);
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

  client.zincrby('rollscores', 1, winner);

  // Using new line characters (\n) to format our response
  bot.send(
    `${challenger} fancies their changes against ${opponent}!\n
${challenger} rolls: ${firstRoll}\n
${opponent} rolls: ${secondRoll}\n\n
*${winner} is the winner!*`
  , channel);

}, true);

bot.respondTo('scoreboard', (message, channel, user) => {
  let args = getArgs(message.text);

  if (args[0] === 'wipe') {
    client.del('rollscores');
    bot.send('The scoreboard has been wiped!', channel);
    return;
  }

  client.zrevrange('rollscores', 0, -1, 'withscores', (err, set) => {
    if (err) {
      bot.send('Oops, something went wrong! Please try again later', channel);
      return;
    }

    if (set.length < 1) {
      bot.send('No scores yet! Challenge each other with the \`roll\` command!', channel);
      return;
    }

    let scores = [];

    // format the set into something a bit easier to use
    for (let i = 0; i < set.length; i++) {
      scores.push([set[i], set[i + 1]]);
      i++;
    }

    bot.send('The current scoreboard is:', channel);
    scores.forEach((score, index) => {
      bot.send(`${index + 1}. ${score[0]} with ${score[1]} points.`, channel);
    });
  });
}, true);

bot.respondTo('todo', (message, channel, user) => {
  let args = getArgs(message.text);

  switch(args[0]) {
    case 'add':
      addTask(user.name, args.slice(1).join(' '), channel);
      break;

    case 'complete':
      completeTask(user.name, parseInt(args[1], 10), channel);
      break;

    case 'delete':
      removeTaskOrTodoList(user.name, args[1], channel);
      break;

    case 'help':
      bot.send('Create tasks with \`todo add [TASK]\`, complete them with \`todo complete [TASK_NUMBER]\` and remove them with \`todo delete [TASK_NUMBER]\` or \`todo delete all\`', channel);
      break;

    default:
      showTodos(user.name, channel);
      break;
  }
}, true);

function showTodos(name, channel) {
  client.smembers(name, (err, set) => {
    if (err || set.length < 1) {
      bot.send(`You don\'t have any tasks listed yet, ${name}!`, channel);
      return;
    }

    bot.send(`${name}'s to-do list:`);

    set.forEach((task, index) => {
      bot.send(`${index + 1}. ${task}`, channel);
    });
  });
}

function addTask(name, task, channel) {
  if (task === '') {
    bot.send('Usage: \`todo add [TASK]\`', channel);
    return;
  }

  client.sadd(name, task);
  bot.send('You added a task!', channel);
  showTodos(name, channel);
}

function completeTask(name, taskNum, channel) {
  if (Number.isNaN(taskNum)) {
    bot.send('Usage: \`todo complete [TASK_NUMBER]\`', channel);
    return;
  }

  client.smembers(name, (err, set) => {
    if (err || set.length < 1) {
      bot.send(`You don\'t have any tasks listed yet, ${user.name}!`, channel);
      return;
    }

    // make sure no task numbers that are out of bounds are given
    if (taskNum > set.length || taskNum <= 0) {
      bot.send('Oops, that task doesn\'t exist!', channel);
      return;
    }

    let task = set[taskNum - 1];

    if (/~/i.test(task)) {
      bot.send('That task has already been completed!', channel);
      return;
    }

    // remove the task from the set
    client.srem(name, task);

    // re-add the task, but with a strikethrough effect
    client.sadd(name, `~${task}~`);

    bot.send('You completed a task!', channel);
    showTodos(name, channel);
  });
}

function removeTaskOrTodoList(name, target, channel) {
  if (typeof target === 'string' && target === 'all') {
    client.del(name);
    bot.send('To-do list cleared!', channel);
    return;
  }

  let taskNum = parseInt(target, 10);

  if (Number.isNaN(taskNum)) {
    bot.send('Usage: \`todo delete [TASK_NUMBER]\` or \`todo delete all\`', channel);
    return;
  }

  // get the set and the exact task
  client.smembers(name, (err, set) => {
    if (err || set.length < 1) {
      bot.send(`You don\'t have any tasks to delete, ${name}!`, channel);
      return;
    }

    if (taskNum > set.length || taskNum <= 0) {
      bot.send('Oops, that task doesn\'t exist!', channel);
      return;
    }

    client.srem(name, set[taskNum - 1]);
    bot.send('You deleted a task!', channel);
    showTodos(name, channel);
  });  
}
