'use strict';

var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var https = require( 'https' );
var fs = require('fs');
var socketIO = require('socket.io');

var fileServer = new(nodeStatic.Server)();

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

var app = http.createServer(function(req, res) {
  fileServer.serve(req, res);
}).listen(80);

var httpsServer = https.createServer(options, function(req, res) {
  fileServer.serve(req, res);
}).listen(443);




var senderId;

var io = socketIO.listen(app);
io.listen(httpsServer);
io.sockets.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', function(message) {
    log('Client said: ', message);
    // for a real app, would be room-only (not broadcast)
    if (message.type === 'offer')
    {
      log('Server sending offer to receiver: ', message.receiverId);
      io.to(message.receiverId).emit('message', message);
    }
    else if (message.type === 'answer')
    {
      io.to(senderId).emit('message', message);
    }
    else if (message.type === 'sender candidate')
    {
      log('Server sending candidates to receiver: ', message.receiverId);
      io.to(message.receiverId).emit('message', message);
    }
    else if (message.type === 'receiver candidate')
    {
      log('Server sending candidates to sender: ', message.senderId);
      io.to(senderId).emit('message', message);
    }
    else if (message.type === 'got user media')
    {
      log('Media ready', message.peerId);
      io.to(senderId).emit('message', message);
      io.to(message.peerId).emit('message', message);
    }
    else
    {
      socket.broadcast.emit('message', message);
    }
  });

  socket.on('create or join', function(data) {
    var room = data.room;
    var role = data.role;

    console.log(room, role, socket.id);

    log('Received request to create or join room ' + room);

    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    log('Room ' + room + ' now has ' + numClients + ' client(s)');

    if (role == 'sender'){
      senderId = socket.id;
      socket.join(room);
      log('Sender ID ' + senderId + ' created room ' + room);
      socket.emit('created', room, senderId);
    }
    else if (role == 'receiver'){
      log('Receiver ID ' + socket.id + ' joined room ' + room);

      io.sockets.in(room).emit('join', room);
      socket.join(room);
      io.in(room).emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready');
    }
  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('bye', function(){
    console.log('received bye');
  });

});
