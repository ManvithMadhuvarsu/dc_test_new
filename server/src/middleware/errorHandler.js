export function errorHandler(err, req, res, next) {
  // Ensure CORS headers are set even for error responses
  if (!res.headersSent) {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }
  
  console.error('[server] Error:', err.message);
  console.error('[server] Stack:', err.stack);
  const status = err.status || 500;
  
  // Only send response if headers haven't been sent
  if (!res.headersSent) {
    res.status(status).json({
      success: false,
      message: err.message || 'Unexpected server error',
    });
  } else {
    // If headers already sent, end the response
    res.end();
  }
}

