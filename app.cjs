// CommonJS wrapper for cPanel/LiteSpeed compatibility
// LiteSpeed's lsnode.js uses require(), which can't load ES modules directly
import('./server/index.js').catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
