// `npm run dev`: compiles js/*.ts to dist/js/ and keeps compiling as you save (tsc --watch), and serves the game
// (serve.js) at the same time. Type errors are reported but never stop the build: the game runs on what compiled.
const { spawn } = require('child_process'), path = require('path');
const root = path.join(__dirname, '..');
const tsc = spawn(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', root, '--watch', '--preserveWatchOutput'], { cwd: root, stdio: 'inherit' });
tsc.on('exit', (code) => process.exit(code || 0));
process.on('exit', () => tsc.kill());
require('../serve.js');
