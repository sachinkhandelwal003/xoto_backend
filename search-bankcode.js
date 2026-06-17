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

walk('D:/xoto_backend/src', (err, files) => {
  if (err) throw err;
  files.forEach(file => {
    if (file.endsWith('.js')) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('bankCode')) {
        console.log(`Found bankCode in: ${file}`);
      }
    }
  });
});
