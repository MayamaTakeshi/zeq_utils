const Zeq = require("@mayama/zeq");
const m = require("data-matching");
const assert = require("assert");
const zeq_utils = require('../index.js');

const mysql = require('mysql2');

const z = new Zeq();

async function test() {
  const mysql_server = await zeq_utils.start_mysql_server(
    z,
    "0.0.0.0",
    13306,
    "mysql_server",
  );

  const connection = mysql.createConnection({
    host: '0.0.0.0',
    port: 13306,
    user: 'root',
    password: 'pass',
    database: 'my_database'
  });

  connection.connect((err) => {
    if (err) {
      z.push_event({
        event: 'mysql_err',
        err: err,
      })
    } else{
      z.push_event({
        event: 'mysql_connected',
      })
    }
  });

  await z.wait([
    {
      event: 'mysql_connected',
    },
  ], 1000)

  connection.query('SELECT 1 + 1 AS solution', (err, results, fields) => {
    if (err) {
      z.push_event({
        event: 'mysql_err',
        err: err,
      })
    } else{
      z.push_event({
        event: 'mysql_res',
        results,
        fields,
      })
    }
  });
  await z.wait([
    {
      event: 'mysql_query',
      query: 'SELECT 1 + 1 AS solution',
      conn: m.collect('conn'),
    },
  ], 1000)

  const row = [
    {
      solution: 2,
    },
  ];

  const columns = [
    {
        catalog: "def",
        schema: "UKNOWN",
        table: "UNKNOWN",
        orgTable: "UNKNOW",
        name: "solution",
        orgName: "solution",
        characterSet: 63,
        columnType: 3,
    },
  ];

  z.store.conn.writeTextResult(row, columns, false);
  z.store.conn._resetSequenceId();

  await z.wait([
   {
      event: 'mysql_res',
      results: [
        {
          solution: 2
        }
      ],
      fields: [
        {
          characterSet: 63,
          encoding: 'binary',
          name: 'solution',
          columnLength: 0,
          columnType: 3,
          type: 3,
          flags: 0,
          decimals: 0
        }
      ]
    }
  ], 2000)

  console.log("success")
  process.exit(0);
}

test().catch((e) => {
    console.error(e);
    process.exit(1);
});
