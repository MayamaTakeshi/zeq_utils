const Zeq = require("@mayama/zeq");
const m = require("data-matching");
const assert = require("assert");
const zeq_utils = require('../index.js');

const mailer = require("nodemailer");
const smtpTransport = require("nodemailer-smtp-transport");

const path = require('path');

const util = require("util");
const fs = require("fs");
const readFile = util.promisify(fs.readFile);

const prepare_email_msg = async function(from, to, subject, text, attachments, headers) {
    var msg = {
        from,
        to, // it might a string or an array of strings
        subject,
        text,
    };

    if(attachments) {
        msg.attachments = []
        for(attachment of attachments) {
            var content
            try {
                content = await readFile(attachment.file_path)
                attachment.content = content.toString("base64")
                attachment.disposition = attachment.disposition ? attachment.disposition : "attachment"
                attachment.encoding = attachment.encoding ? attachment.encoding : "base64"
                delete attachment.file_path
                msg.attachments.push(attachment)
            } catch (e) {
                console.log(e)
                return null
            }
        }
    }

    if(headers) {
        msg.headers = headers // sgMail cannot handle this if it is null (not sure about mailer)
    }

    return msg
}

const dispatch_email_via_smtp = async function(msg) {
    if(Array.isArray(msg.to)) {
        msg.to = msg.to.join(","); // mailer doesn't accept an array
    }

    var transport = mailer.createTransport(
        smtpTransport({
            host: '0.0.0.0',
            port: 2525,
            //secure: false,
            ignoreTLS: true,
            use_authentication: false,
        })
    );

    try {
        await transport.sendMail(msg);
        return true
    } catch (err) {
        return false
    }
}

const send_email_via_smtp = async function(from, to, subject, text, attachments, headers) {
    var msg = await prepare_email_msg(from, to, subject, text, attachments, headers)
    if(!msg) {
        return false
    }

    return dispatch_email_via_smtp(msg)
}


const z = new Zeq();

async function test() {
  const smtp_server = await zeq_utils.start_smtp_server(
      z,
      "0.0.0.0",
      2525,
      "smtp_server",
  );

  const to_email = "user2@test2.com"

  const from = "user1@test1.com"
  const to = [to_email]
  const subject = "test"
  const text = "test test test"

  const filename = "fax.tiff"
  const type = "image/tiff"
  const disposition = "attachment"
  const contentId = "image"
  const encoding = "base64"

  const file_path = path.join(__dirname, "artifacts", filename)

  const attachments = [
      {
          file_path,
          filename,
          type,
          disposition,
          contentId,
          encoding,
      }
  ]

  const headers = null

  send_email_via_smtp(from, to, subject, text, attachments, headers)

  await z.wait([
    {
      event: "smtp_mail",
      mail: {
        attachments: [
          {
            type: "attachment",
            //content: // need to add code to check
            contentType: type,
            partId: "2",
            contentDisposition: "attachment",
            filename,
          },
        ],
        text,
        subject,
        to: {
          text: to_email,
        },
        from: {
          text: from,
        },
      },
    },
  ], 1000)

  console.log("success")
  process.exit(0);
}

test().catch((e) => {
    console.error(e);
    process.exit(1);
});
