'use strict';

const http = require('http');
const request = require('superagent');

const WOLFRAM_TOKEN = 'YOUR_WOLFRAM_TOKEN';
const SLACK_TOKEN = 'YOUR_SLACK_TOKEN';

const Client = require('node-wolfram');
const wolfram = new Client(WOLFRAM_TOKEN);

// create a simple server with node's built in http module
http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'});

    // get the data embedded in the POST request
    req.on('data', (chunk) => {
      // chunk is a buffer, so first convert it to a string and split it to make it legible
      console.log('Body:', chunk.toString().split('&'));

      let bodyArray = chunk.toString().split('&');
      let bodyObject = {};

      // convert the data array to an object
      for (let i = 0; i < bodyArray.length; i++) {
        // convert the strings into key value pairs
        let arr = bodyArray[i].split('=');
        bodyObject[arr[0]] = arr[1];
      }

      // if the token doesn't match ours, abort
      if (bodyObject.token !== SLACK_TOKEN) {
        return res.end(JSON.stringify({
          response_type: 'ephemeral',
          text: 'Invalid token'
        }));
      }

      // send a message immediately to confirm that
      // the request was receive it's possible that the
      // query will take longer than the time Slack waits
      // for a response (3000ms), so we'll send a
      // preliminary response and then send the results later
      res.end(JSON.stringify({
        response_type: 'in_channel',
        text: 'Calculating response, be with you shortly!'
       }));

      // make sure to unescape the value so we don't get unicode
      let query = unescape(bodyObject.text.split('+').join(' '));

      queryWolfram(query, (err, result) => {
        if (err) {
          console.log(err);
          return;
        }

        // send the result from the wolfram alpha request,
        // which probably took longer than 3000ms to calculate
        request
          .post(unescape(bodyObject.response_url))
          .send({
            response_type: 'in_channel',
            text: result
          })
          .end((err, res) => {
            if (err) console.log(err);
          });
    });
  });
}).listen(8080, '0.0.0.0');

console.log('Server running at http://0.0.0.0:8080/');

function queryWolfram(message, done) {
  wolfram.query(message, (err, result) => {
    if (err) {
      return done(err);
    }

    // if the query didn't fail, but the message wasn't understood
    // then send a generic error message
    if (result.queryresult.$.success === 'false') {
      return done(null, 'Sorry, something went wrong, please try again');
    }

    let msg = [];

    for (let i = 0; i < result.queryresult.pod.length; i++) {
      let pod = result.queryresult.pod[i];

      // print the title in bold
      msg.push(`*${pod.$.title}:*\n`);

      for (let j = 0; j < pod.subpod.length; j++) {
        let subpod = pod.subpod[j];

        for (let k = 0; k <subpod.plaintext.length; k++) {
          let text = subpod.plaintext[k];
          if (text) {
            // add a tab to the beginning
            msg.push('\t' + text + '\n');
          } else {
            // text is empty, so get rid of the title as well
            msg.pop();
          }
        }
      }
    }

    // join the msg array together into a string
    done(null, msg.join(''));
  });
}