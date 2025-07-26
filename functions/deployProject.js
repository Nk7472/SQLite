const AdmZip = require("adm-zip");
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const boundary = event.headers["content-type"].split("boundary=")[1];
    const buffer = Buffer.from(event.body, "base64");

    const parts = parseMultipart(buffer, boundary);

    // Extract custom site name and files
    let siteName = "";
    const zip = new AdmZip();

    for (const part of parts) {
      if (part.name === "siteName") {
        siteName = part.content.toString().trim().toLowerCase().replace(/\s+/g, "-");
      } else if (part.filename) {
        zip.addFile(part.filename, part.content);
      }
    }

    const zippedBuffer = zip.toBuffer();

    // Create site (either with requested name or random)
    let siteResponse;
    if (siteName) {
      siteResponse = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers: {
          Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: siteName }),
      });

      // If site name is taken or invalid, fallback to random
      if (!siteResponse.ok) {
        siteResponse = await fetch("https://api.netlify.com/api/v1/sites", {
          method: "POST",
          headers: {
            Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
            "Content-Type": "application/json",
          },
        });
      }
    } else {
      siteResponse = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers: {
          Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
          "Content-Type": "application/json",
        },
      });
    }

    const siteData = await siteResponse.json();
    const siteId = siteData.id;
    if (!siteId) throw new Error(siteData.message || "Site creation failed");

    // Deploy zipped content to the created site
    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
        "Content-Type": "application/zip",
      },
      body: zippedBuffer,
    });

    const deployData = await deployRes.json();
    if (!deployData.ssl_url && !deployData.url) {
      throw new Error(deployData.message || "Deployment failed");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        url: deployData.ssl_url || deployData.url,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};

// Multipart parser
function parseMultipart(buffer, boundary) {
  const result = [];
  const parts = buffer.toString().split(`--${boundary}`);

  for (const part of parts) {
    if (part.includes("Content-Disposition")) {
      const nameMatch = /name="([^"]+)"/.exec(part);
      const filenameMatch = /filename="([^"]+)"/.exec(part);
      const contentStart = part.indexOf("\r\n\r\n") + 4;
      const content = part.slice(contentStart, -2);

      result.push({
        name: nameMatch?.[1],
        filename: filenameMatch?.[1],
        content: Buffer.from(content, "utf8"),
      });
    }
  }

  return result;
}
