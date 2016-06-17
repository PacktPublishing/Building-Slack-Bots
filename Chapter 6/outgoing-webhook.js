'use strict';

const http = require('http');

// create a simple server with node's built in http module
http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'});

  // get the data embedded in the POST request
  req.on('data', (chunk) => {
    // chunk is a buffer, so first convert it to 
    // a string and split it to make it more legible as an array
     console.log('Body:', chunk.toString().split('&'));
  });

  // create a response
  let response = JSON.stringify({
    text: ‘Outgoing webhook received!’
  });

  // send the response to Slack as a message
  res.end(response);
}).listen(8080, ‘0.0.0.0’);

console.log('Server running at http://0.0.0.0:8080/');
