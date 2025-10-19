const AdmZip = require("adm-zip");
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const boundary = event.headers["content-type"].split("boundary=")[1];
    const buffer = Buffer.from(event.body, "base64");

    // Extract files + fields from form-data
    const { files, fields } = parseMultipart(buffer, boundary);
    const zip = new AdmZip();

    for (const file of files) {
      if (file.filename) {
        zip.addFile(file.filename, file.content);
      }
    }

    const zippedBuffer = zip.toBuffer();

    // Prepare site creation payload
    const sitePayload = fields.site_name ? { name: fields.site_name } : {};

    // Create new Netlify site (optionally with custom name)
    const siteRes = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer nfp_MMXJcHZwLQ5k99KAURBe1nCbZzrvg1qb3207`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(sitePayload)
    });

    const siteData = await siteRes.json();
    if (!siteData.id) throw new Error("Site creation failed");

    // Deploy zipped folder to the created site
    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteData.id}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer nfp_MMXJcHZwLQ5k99KAURBe1nCbZzrvg1qb3207`,
        "Content-Type": "application/zip"
      },
      body: zippedBuffer
    });

    const deployData = await deployRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        url: deployData.ssl_url || deployData.url
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};

// Multipart parser that extracts files and fields
function parseMultipart(buffer, boundary) {
  const result = { files: [], fields: {} };
  const parts = buffer.toString().split(`--${boundary}`);

  for (const part of parts) {
    if (part.includes("Content-Disposition")) {
      const nameMatch = /name="([^"]+)"/.exec(part);
      const fileMatch = /filename="([^"]+)"/.exec(part);
      const contentStart = part.indexOf("\r\n\r\n") + 4;
      const content = part.slice(contentStart, -2); // remove trailing \r\n

      if (fileMatch) {
        // It's a file
        result.files.push({
          filename: fileMatch[1],
          content: Buffer.from(content)
        });
      } else if (nameMatch) {
        // It's a field
        result.fields[nameMatch[1]] = content.trim();
      }
    }
  }

  return result;
}
