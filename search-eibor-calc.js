const fs = require('fs');
const path = require('path');

const walk = (dir, done) => {
  let results = [];
  fs.readdir(dir, (err, list) => {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(file => {
      file = path.resolve(dir, file);
      fs.stat(file, (err, stat) => {
        if (stat && stat.isDirectory()) {
          walk(file, (err, res) => {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
};

const searchDir = 'D:/xoto_backend/src';
walk(searchDir, (err, files) => {
  if (err) throw err;
  files.forEach(file => {
    if (file.endsWith('.js')) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.toLowerCase().includes('eibor')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('eibor') || line.toLowerCase().includes('calc') || line.toLowerCase().includes('rate')) {
            console.log(`backend:${path.basename(file)}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  });
});

const searchDir2 = 'D:/xoto_vault/src';
walk(searchDir2, (err, files) => {
  if (err) throw err;
  files.forEach(file => {
    if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.toLowerCase().includes('eibor')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('eibor') || line.toLowerCase().includes('calc') || line.toLowerCase().includes('rate')) {
            console.log(`frontend:${path.basename(file)}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  });
});
