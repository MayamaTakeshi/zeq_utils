const Zeq = require("@mayama/zeq");
const m = require("data-matching");
const assert = require("assert");
const zeq_utils = require('../index.js');

const Redis = require("ioredis");

const z = new Zeq();

async function test() {
    await zeq_utils.start_redis_server(
        z,
        '0.0.0.0',
        26381,
        "redis_server"
    );

    const redis = new Redis({
      host: "0.0.0.0",
      port: 26381,
    });

    await zeq_utils.wait_ioredis_connection_initialization(z, "redis_server")

    redis.get('mykey')
    .then(res => {
      z.push_event({
          event: 'redis_res',
          res,
      })
    })
    .catch(err => {
      z.push_event({
        event: 'redis_err',
        err,
      })
    })
 
    await z.wait([
      {
        name: 'redis_msg',
        server: 'redis_server',
        msg: [
        'get',
        `mykey`,
        ],
        socket: m.collect('socket'),
      },
    ], 2000)

    zeq_utils.send_redis_reply(z.store.socket, {
      body: ['myval'],
    })

    await z.wait([
      {
        event: 'redis_res',
        res: [
          [
            'myval'
          ]
        ]
      },
    ], 1000)

    console.log("success")
    process.exit(0);
}

test().catch((e) => {
    console.error(e);
    process.exit(1);
});
