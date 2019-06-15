

var http = require('http');
var server = http.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    var message = 'NodeJS ' + process.versions.node + '\n',
        version = ' port ' + process.env.PORT + '\n',
        response = [message, version].join('\n');
    res.end(response);
});
server.listen(8000); 
/*
//const fs = require('fs')
const express = require('express');
const app = express();
//const browserify = require('browserify-middleware')
const path = require('path')
const configureSSL = require('./configure-ssl.js');

 var server = configureSSL(app);
// crear un servidor en puerto 8000
server.listen(8000, function (req, res) {
    // imprimir la direccion ip en la consola
    // console.log('servidor disponible en https://'+myip.getLocalIP4()+':8000')
    console.log('server available at https://localhost:8000 NodeJS ' + process.versions.node);

  })

  app.use(express.static(path.join(__dirname, '/public')))
*/