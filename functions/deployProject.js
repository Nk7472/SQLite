const AdmZip = require("adm-zip");
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const boundary = event.headers["content-type"].split("boundary=")[1];
    const buffer = Buffer.from(event.body, "base64");

    // Extract files from form-data
    const files = parseMultipart(buffer, boundary);
    const zip = new AdmZip();

    for (const file of files) {
      if (file.filename) {
        zip.addFile(file.filename, file.content);
      }
    }

    const zippedBuffer = zip.toBuffer();

    const res = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
        "Content-Type": "application/zip"
      },
      body: zippedBuffer
    });

    const result = await res.json();

    return {
      statusCode: 200,
      body: JSON.stringify({ url: result.ssl_url || result.url })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};

// Minimal multipart parser for small uploads
function parseMultipart(buffer, boundary) {
  const result = [];
  const parts = buffer.toString().split(`--${boundary}`);

  for (const part of parts) {
    if (part.includes("Content-Disposition")) {
      const match = /name="[^"]+"; filename="([^"]+)"/.exec(part);
      const contentStart = part.indexOf("\r\n\r\n") + 4;
      const content = part.slice(contentStart, -2); // remove trailing \r\n
      result.push({ filename: match?.[1], content: Buffer.from(content) });
    }
  }
  return result;
}
