const fs = require('fs')
const keyData = fs.readFileSync('./project-11.json','utf8')
const base64 = Buffer.from(keyData).toString('base64')
console.log(base64)
