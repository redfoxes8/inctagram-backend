const fs = require('fs');
const path = require('path');

function walk(d) {
  fs.readdirSync(d).forEach((f) => {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory() && f !== 'node_modules' && f !== 'prisma' && f !== 'test' && f !== 'dist') {
      walk(p);
    } else if (p.endsWith('.ts')) {
      const c = fs.readFileSync(p, 'utf8');
      if (c.includes('MessagePattern')) console.log(p);
    }
  });
}

walk('apps/micro-files-service/src');
