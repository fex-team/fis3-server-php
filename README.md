# fis3-server-php

通过 express + phpcgi 实现对 php 支持的服务器。

对于不存在的请求，默认自动转发到 index.php 文件，由 index.php 来决定如何处理。

## 使用

```bash
npm install -g fis3-server-php
fis3 server start --type php
```
