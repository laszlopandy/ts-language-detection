ts-language-detection
=====================

A TypeScript source port of Nakatani Shuyo's excellent [language detection library in Java](https://code.google.com/p/language-detection/).

## Web interface on localhost
```
# install dependencies
npm install tsc
npm install lazy

# compile TypeScript
tsc --target ES5 --out webinterface.js src/webinterface.ts

# run web server
python -m SimpleHTTPServer 8000 &

# open page
open http://localhost:8000/index.html

```
