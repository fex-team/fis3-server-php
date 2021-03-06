var path = require('path');
var util = fis.require('command-server/lib/util.js');
var spawn = require('child_process').spawn;
var fs = require('fs');

// 每 0.2 秒读取子进程的输出文件。
//
// 为什么不直接通过 child.stdout 读取？
// 因为如果使用 stdio pipe 的方式去开启子进程，当 master 进程退出后，子进程再有输出就会导致程序莫名的崩溃。
// 解决办法是，让子进程的输出直接指向文件指针。
// master 每隔一段时间去读文件，获取子进程输出。
function watchOnFile(filepath, callback) {
  var lastIndex = 0;
  var timer;

  function read() {
    var stat = fs.statSync(filepath);

    if (stat.size != lastIndex) {
      var fd = fs.openSync(filepath, 'r');
      var buffer = new Buffer(stat.size - lastIndex);

      try {
        fs.readSync(fd, buffer, lastIndex, stat.size - lastIndex);
        var content = buffer.toString('utf8');
        lastIndex = stat.size;

        callback(content);
      } catch (e) {
        lastIndex = 0;
      }
    }

    setTimeout(read, 200);
  }

  read();
  return function() {
    clearTimeout(timer);
  };
}

function checkPHPEnable(opt, callback) {
  var check = function(data) {
    if (!phpVersion) {
      phpVersion = util.matchVersion(data.toString('utf8'));
      if (phpVersion) {
        process.stdout.write('v' + phpVersion + '\n');
      }
    }
  };
  //check php-cgi
  process.stdout.write('checking php-cgi support : ');
  var php = spawn(opt.php_exec || 'php-cgi', ['--version']);
  var phpVersion = false;
  php.stdout.on('data', check);
  php.stderr.on('data', check);
  php.on('error', function() {
    process.stdout.write('unsupported php-cgi environment\n');
    // fis.log.notice('launching java server.');
    delete opt.php_exec;
    callback(phpVersion, opt);
  });
  php.on('exit', function() {
    callback(phpVersion, opt);
  })
}

function start(opt, callback) {
  var script = path.join(opt.root, 'server.js');

  if (!fis.util.exists(script)) {
    script = path.join(__dirname, 'app.js');
  }

  // 默认创建一个 index.php 文件，提供示范。
  var phpScript = path.join(opt.root, 'index.php');
  if (!fis.util.exists(phpScript)) {
    fis.util.write(phpScript, fis.util.read(path.join(__dirname, 'index.php')));
  }

  var timeout = Math.max(opt.timeout * 1000, 5000);
  var timeoutTimer;
  var args = [
    script
  ];

  // 把 options 通过 args 传给 app 程序。
  fis.util.map(opt, function(key, value) {
    args.push('--' + key, String(value));
  });

  process.stdout.write('\n Starting fis-server .');
  var logFile = path.join(opt.root, 'server.log');
  var server = spawn(process.execPath, args, {
    cwd: path.dirname(script),
    detached: opt.daemon,
    stdio: [0, opt.daemon ? fs.openSync(logFile, 'w') : 'pipe', opt.daemon ? fs.openSync(logFile, 'w+') : 'pipe']
  });

  var log = '';
  var started = false;
  var stoper;

  function onData(chunk) {
    if (started) {
      return;
    }

    chunk = chunk.toString('utf8');
    log += chunk;
    process.stdout.write('.');

    if (~chunk.indexOf('Error')) {

      process.stdout.write(' fail.\n');
      try {
        process.kill(server.pid, 'SIGKILL');
      } catch (e) {}

      var match = chunk.match(/Error:?\s+([^\r\n]+)/i);
      var errMsg = 'unknown';

      if (~chunk.indexOf('EADDRINUSE')) {
        log = '';
        errMsg = 'Address already in use:' + opt.port;
      } else if (match) {
        errMsg = match[1];
      }

      log && console.log(log);
      callback(errMsg);
      stoper && stoper();
    } else if (~chunk.indexOf('Listening on')) {
      started = true;
      stoper && stoper();
      clearTimeout(timeoutTimer);

      process.stdout.write(' at port [' + opt.port + ']\n');

      callback(null);
    }
  }

  if (opt.daemon) {
    stoper = watchOnFile(logFile, onData);
    util.pid(server.pid);
    server.unref();

    timeoutTimer = setTimeout(function() {
      process.stdout.write(' fail\n');
      if (log) console.log(log);
      fis.log.error('timeout');
    }, timeout);
  } else {
    server.stdout.pipe(process.stdout);
    server.stderr.pipe(process.stderr);
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
  }
}

// 入口
exports.start = function(opt, callback) {
  checkPHPEnable(opt, function(version) {
    if (version) {
      // seems ok
      start(opt, callback);
    } else {
      callback('`php-cgi` is required.');
    }
  });
};
