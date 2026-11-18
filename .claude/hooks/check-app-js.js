// PostToolUse hook: after Claude edits app.js, check it for syntax errors.
// Exit code 2 sends the error text back to Claude so it can fix it.
const { spawnSync } = require('child_process');
const path = require('path');

// This project's app.js (the hook script lives in <project>/.claude/hooks/).
const target = path.resolve(process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..'), 'app.js');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  let file = '';
  try {
    const data = JSON.parse(input);
    file = (data.tool_input && data.tool_input.file_path) || '';
  } catch (e) {
    return; // not valid JSON: nothing to check
  }
  if (!file || path.resolve(file).toLowerCase() !== target.toLowerCase()) return; // only this project's app.js

  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write('Syntax error in app.js:\n' + result.stderr);
    process.exit(2);
  }
});
