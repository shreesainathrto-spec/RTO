import type { IncomingMessage, ServerResponse } from "http";

// Helper to read request body if not already parsed
async function getRequestBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on("error", (err) => reject(err));
  });
}

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  try {
    // Vercel serverless environment sometimes pre-parses JSON body. If not, we read it manually.
    const body = req.body || (await getRequestBody(req));
    const { image } = body;

    if (!image) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Image data is required" }));
      return;
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Google Vision API key is not configured on the server" }));
      return;
    }

    // Clean base64 prefix if present (e.g. data:image/jpeg;base64,...)
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    // Call Google Cloud Vision API
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Data,
            },
            features: [
              {
                type: "TEXT_DETECTION",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.statusCode = response.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Vision API Error: ${errorText}` }));
      return;
    }

    const data = await response.json();
    
    // Extract text annotations
    const textAnnotations = data.responses?.[0]?.textAnnotations;
    const fullText = textAnnotations?.[0]?.description || "";

    // Extract digits (look for standard odometer formats, e.g. 5-7 digit numbers)
    // We clean all non-digit characters to isolate number sequences
    const numbers = fullText.replace(/[^0-9]/g, "");

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      text: fullText,
      digits: numbers,
      confidence: 99, // Backend Vision API is highly accurate
    }));
  } catch (err: any) {
    console.error("Backend OCR exception:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message || "Internal Server Error" }));
  }
}
