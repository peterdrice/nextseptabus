// In netlify/functions/septa-proxy.js

exports.handler = async (event) => {
  const { url } = event.queryStringParameters;

  // Validate that a URL was actually passed
  if (!url) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "URL parameter is required" }),
    };
  }

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);

    // If the response from SEPTA is not successful (e.g., 404, 500),
    // we want to know why.
    if (!response.ok) {
      console.error(`SEPTA API responded with status: ${response.status}`);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `SEPTA API error: ${response.statusText}` }),
      };
    }

    const data = await response.json();

    // Success! Return the data from SEPTA.
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(data),
    };

  } catch (error) {
    // This is the crucial part for debugging.
    // It will log the *actual* error to your Netlify function logs.
    console.error("Proxy function runtime error:", error);

    // Also return a more descriptive error to the browser's console.
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "The proxy function failed to execute.",
        details: error.message,
      }),
    };
  }
};