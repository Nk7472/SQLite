// deployProject.js
const AdmZip = require("adm-zip");
const fetch = require("node-fetch");
const { Readable } = require("stream");

exports.handler = async (event) => {
  try {
    const boundary = event.headers["content-type"].split("boundary=")[1];
    const busboy = require("busboy");
    const { PassThrough } = require("stream");
    const bb = busboy({ headers: event.headers });

    const zip = new AdmZip();
    const files = [];
    let siteName = "";

    await new Promise((resolve, reject) => {
      const stream = Readable.from(event.body, { encoding: "base64" });
      stream.pipe(bb);

      bb.on("file", (fieldname, file, filename) => {
        const buffer = [];
        file.on("data", (data) => buffer.push(data));
        file.on("end", () => {
          const fullPath = filename;
          zip.addFile(fullPath, Buffer.concat(buffer));
        });
      });

      bb.on("field", (name, value) => {
        if (name === "siteName") siteName = value;
      });

      bb.on("finish", resolve);
      bb.on("error", reject);
    });

    const zipBuffer = zip.toBuffer();

    const NETLIFY_TOKEN = "nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800"; // Set in Netlify Dashboard
    const res = await fetch(`https://api.netlify.com/api/v1/sites`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: siteName }),
    });

    const siteData = await res.json();
    if (siteData.message) throw new Error(siteData.message);

    await fetch(`https://api.netlify.com/api/v1/sites/${siteData.id}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/zip",
      },
      body: zipBuffer,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: `https://${siteData.name}.netlify.app` }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
