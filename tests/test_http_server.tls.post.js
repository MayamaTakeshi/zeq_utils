const Zeq = require("@mayama/zeq");
const m = require("data-matching");
const assert = require("assert");
const http = require("http");
const zeq_utils = require('../index.js');
const axios = require('axios');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const z = new Zeq();

async function test() {
    await zeq_utils.start_http_server(z, "0.0.0.0", 8899, "http_server", true);

    var uri = `https://0.0.0.0:8899/test`;

    var data = {
      a: 1,
      b: 2,
    }

    axios.post(
      uri,
      data,
      {
        // Prevents Axios from throwing an error on 4xx/5xx status codes.
        // It will only reject the promise on network errors (DNS, connection issues, etc.).
        validateStatus: (status) => true,

        // Disables automatic following of 3xx redirects.
        maxRedirects: 0,

        headers: {
          'X-My-Header': 'abc',
        }
      }
    )
    .then(res => {
      z.push_event({
          event: 'https_res',
          res,
      })
    })
    .catch(err => {
      z.push_event({
        event: 'https_err',
        err,
      })
    })

    await z.wait([
      {
        event: 'https_req',
        req: {
          url: '/test',
          method: 'POST',
          headers: {
            'x-my-header': 'abc',
          },
          body: data,
        },
        res: m.collect('res'),
      },
    ], 1000)

    z.store.res.writeHead(200, { 'Content-Type': 'application/json' });
    z.store.res.end(JSON.stringify(data));

    await z.wait([
      {
        event: 'https_res',
        res: {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
          data,
        }
      },
    ], 2000)

    console.log("success")
    process.exit(0);
}

test().catch((e) => {
    console.error(e);
    process.exit(1);
});
