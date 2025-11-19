import app from './app.js';
import { config } from './config/env.js';
import { getActiveSessionCount } from './utils/auditLogger.js';

const port = config.port;
const host = '0.0.0.0'; // Listen on all network interfaces

app.listen(port, host, () => {
  console.log(`Secure exam server listening on port ${port}`);
  console.log(`Accessible at: http://localhost:${port} and http://[your-ip]:${port}`);
  console.log('=== Audit Logging Active ===');
  console.log('Monitoring student sessions in real-time...\n');
}).on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${port} is already in use!`);
    console.error(`Please stop the process using port ${port} or change the PORT in .env file.\n`);
  } else {
    console.error('\n❌ ERROR: Failed to start server:', error.message);
    console.error('Stack:', error.stack, '\n');
  }
  process.exit(1);
});

