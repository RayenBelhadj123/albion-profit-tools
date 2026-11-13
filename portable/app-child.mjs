// IPC works on Windows, where child.kill('SIGTERM') would force termination.
// Next installs its own SIGTERM handler; emitting it lets Next drain requests.
import { Server } from 'node:net';

const originalListen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  this.once('listening', () => {
    const address = this.address();
    if (address && typeof address !== 'string' && address.address === '127.0.0.1' && address.port === Number(process.env.PORT)) {
      process.send?.({ type: 'albion-listening' });
    }
  });
  return originalListen.apply(this, args);
};
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!process.emit('SIGTERM', 'SIGTERM')) process.exit(0);
}
process.on('message', (message) => { if (message?.type === 'albion-shutdown') shutdown(); });
// Parent crash must not leave an app using a database whose owner is gone.
process.on('disconnect', shutdown);
