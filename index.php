<?php

list($requestPath) = explode("?", $_SERVER['REQUEST_URI']);

if (!file_exists(dirname(__FILE__)."/".$requestPath)) {
  header("HTTP/1.0 404 Not Found");

  // // 所有没有处理的请求被转发到这个脚本，可以根据自己的需求处理一些 url 请求。
  echo "No exists request will rewrite to this script, please override this.\n";
  die();
}

echo 'It works!';
