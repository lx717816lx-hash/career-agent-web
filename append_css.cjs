const fs = require('fs');
let css = fs.readFileSync('src/styles.css', 'utf8');
let iv = fs.readFileSync('iv_styles.css', 'utf8');
fs.writeFileSync('src/styles.css', css + '\n' + iv);
console.log('OK');
