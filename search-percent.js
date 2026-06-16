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

const searchDir = 'D:/xoto_vault/src';
walk(searchDir, (err, files) => {
  if (err) throw err;
  files.forEach(file => {
    if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('Follow-On Rate (%)')) {
        console.log(`Found exact in vault: ${file}`);
      }
    }
  });
});

const searchDir2 = 'D:/xoto_backend/src';
walk(searchDir2, (err, files) => {
  if (err) throw err;
  files.forEach(file => {
    if (file.endsWith('.js')) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('Follow-On Rate (%)')) {
        console.log(`Found exact in backend: ${file}`);
      }
    }
  });
});
