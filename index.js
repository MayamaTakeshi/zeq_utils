const https = require('https')
const path = require('path')
const fs = require('fs')
const http = require('http')
const assert = require('assert')
const m = require('data-matching')
const mysql = require('mysql2')
const nodeRedisProtocol = require('node-redis-protocol')
const redisProto = require('redis-proto')
const net = require('net')
const _ = require('lodash')
const axios = require('axios')

async function start_http_server(z, server_host, server_port, name, use_tls) {
    var options = {};

    var http_module = http;

    var proto = "http";

    if (use_tls) {
        const keyPath = path.join(__dirname, "artifacts", "server.key");
        const certPath = path.join(__dirname, "artifacts", "server.crt");

        options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
        }

        http_module = https;
        proto = "https";
    }

    return new Promise((resolve, reject) => {
        const server = http_module.createServer(options, (req, res) => {
            let body = "";

            req.on("data", (chunk) => {
                body += chunk;
            });

            req.on("end", () => {
                console.log("http server got", body); // Entire body received
                if (req.headers["content-type"] == "application/json") {
                    body = JSON.parse(body);
                }
                req.hdrs = req.headers; // workaround because req.headers is not a key. It seems there is a proxy object that intercepts calls to 'headers' and processes rawHeaders.
                req.body = body;
                const evt = {
                    event: `${proto}_req`,
                    server: name,
                    req,
                    res,
                };
                console.log(`pushing event ${evt} from server ${evt.server}`);
                z.push_event(evt);
            });
        });

        server.listen(server_port, server_host);

        server.on("error", (err) => {
            reject(err);
        });

        server.on("listening", () => {
            resolve(server);
        });
    });
}

async function start_mysql_server(z, server_host, server_port, name) {
    const server = mysql.createServer();
    var conn_id = 0;
    server.on("connection", (conn) => {
        console.log("mysql connection request");
        z.push_event({
            event: "new_mysql_conn",
            server: name,
            conn,
        });
        conn_id++;
    });
    server.listen(server_port, server_host);

    server.on("error", (error) => {
        z.push_event({
            event: "mysql_error",
            server: name,
            error,
        });
    });

    return server;
}

async function start_redis_server(z, server_host, server_port, name) {
  return new Promise((resolve, reject) => {
    var s = net.createServer(socket => {
      var rp = new nodeRedisProtocol.ResponseParser()

      var pending = []

      rp.on('response', msg => {
        console.log(`server ${name} got: ${JSON.stringify(msg)}`)

        z.push_event({ name: 'redis_msg', server: name, msg, socket, })

        if(pending.length > 0) {
          var data = pending.shift()
          rp.parse(data)
        }
      })

      socket.on('error', err => {
        throw `server ${server.name} error:\n${err.stack}`
      })

      socket.on('data', data => {
        if(pending.length > 0) {
          pending.push(data)
        } else {
          rp.parse(data)
        }
      })
    })

    s.listen(server_port, server_host)

    s.on('listening', e => {
      if(e) {
        reject(e)
      } else {
        resolve()
      }
    })
  });
}

var send_redis_reply = (socket, reply) => {
  console.log("send_redis_reply: data=" + JSON.stringify(reply))
  if(Array.isArray(reply.body)) {
    var data = redisProto.encode(reply.body)
    socket.write("*1\r\n", err => {
      if(err) {
        throw `Error when writing TCP packet ${data}: ${err}`
      }
      socket.write(data, err => {
        if(err) {
          throw `Error when writing TCP packet ${data}: ${err}`
        }
      });
    });
  } else {
    socket.write(reply, err => {
      if(err) {
        throw `Error when writing TCP packet ${data}: ${err}`
      }
    });
  }
}

async function wait_ioredis_connection_initialization(z, name) {
  await z.wait([
    {
      name: 'redis_msg',
      server: name,
      msg: ['info'],
      socket: m.collect('socket'),
    },
  ], 2000)

  send_redis_reply(z.store.socket, {"body":['# Server', 'redis_version:7.0.0', 'role:master', 'db0:keys=10,expires=0,avg_ttl=0']})

  await z.wait([
    {
      name: 'redis_msg',
      server: name,
      msg: ['client', 'SETINFO', 'LIB-NAME', 'ioredis'],
      socket: m.collect('socket'),
    },
  ], 1000)

  send_redis_reply(z.store.socket, '+OK\r\n')

  await z.wait([
    {
      name: 'redis_msg',
      server: name,
      msg: ['client', 'SETINFO', 'LIB-VER', '!{_}'],
      socket: m.collect('socket'),
    },
  ], 1000)

  send_redis_reply(z.store.socket, '+OK\r\n')
}

module.exports = {
  start_http_server,
  start_mysql_server,
  start_redis_server,

  send_redis_reply,
  wait_ioredis_connection_initialization,
}
