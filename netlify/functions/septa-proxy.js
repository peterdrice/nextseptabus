// netlify/functions/septa-proxy.js

// This is the serverless function that will act as our proxy
exports.handler = async (event, context) => {
  // Get the original SEPTA URL from the query string
  const { url } = event.queryStringParameters;

  try {
    // Dynamically import 'node-fetch'
    const fetch = (await import('node-fetch')).default;

    const response = await fetch(url);
    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Allow requests from any origin
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch data from SEPTA API" }),
    };
  }
};