const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');
let n = fs.readFileSync('new_render_interview.jsx', 'utf8');
let start = c.indexOf('  const renderInterview = () => (');
let end = c.indexOf('\n  const renderTab = () =>');
c = c.slice(0, start) + n.trim() + '\n\n' + c.slice(end);
fs.writeFileSync('src/App.jsx', c);
console.log('OK');
