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
      if (content.toLowerCase().includes('ltv') || content.toLowerCase().includes('interestrate')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('parsefloat') || line.toLowerCase().includes('replace') || line.toLowerCase().includes('.max') || line.toLowerCase().includes('eligibility')) {
            if (line.toLowerCase().includes('ltv') || line.toLowerCase().includes('rate')) {
              console.log(`${path.basename(file)}:${idx + 1}: ${line.trim()}`);
            }
          }
        });
      }
    }
  });
});
