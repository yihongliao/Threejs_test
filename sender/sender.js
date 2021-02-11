'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var isReceiverStart = false;
var localStream;
var pc;
var receivers = {};
var senderId;
var remoteStream;
var turnReady;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();
var socket_role;

socket_role = 'sender';
if (room !== '') {
  socket.emit('create or join', {room: room, role:socket_role});
  console.log('Attempted to create or join room', room);
}

socket.on('created', function(room, sender) {
  console.log('Created room ' + room + ' Sender ID: ' + sender);
  senderId = sender
  isInitiator = true;
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room, receiverId) {
  console.log('joined: ' + room + ' receiver: ' + receiverId);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message.type === 'got user media' && message.peerId!=senderId) {
    createPeerConnection(message.peerId);
    doCall(message.peerId);
  } else if (message.type === 'offer') {
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer') {
    receivers[message.receiverId].peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
  } else if (message.type === 'receiver candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    receivers[message.receiverId].peerConnection.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

navigator.mediaDevices.getUserMedia({
  audio: false,
  video: true
})
.then(gotStream)
.catch(function(e) {
  alert('getUserMedia() error: ' + e.name);
});

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage({type: 'got user media', peerId: senderId});
}

var constraints = {
  video: true
};

console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}


window.onbeforeunload = function() {
  sendMessage('bye');
};

/////////////////////////////////////////////////////////

function createPeerConnection(receiverId) {
  try {

    var peerConnection = new RTCPeerConnection(null);
    console.log("Created peer connection for ", receiverId,  ":\n", peerConnection)

    peerConnection.onicecandidate = function(event) {
      console.log('icecandidate event: ', event);
      if (event.candidate) {
        sendMessage({
          type: 'sender candidate',
          receiverId: receiverId,
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        });
      } else {
        console.log('End of candidates.');
      }
    }

    //peerConnection.onicecandidate = handleIceCandidate;

    peerConnection.onaddstream = handleRemoteStreamAdded;
    peerConnection.onremovestream = handleRemoteStreamRemoved;

    var receiver = { peerConnection: peerConnection, dataChannel: null };

    //add client connection to list of clients on server
    receivers[receiverId] = receiver;
    peerConnection.addStream(localStream);
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}


function doCall(receiverId) {
  console.log('Sending offer to peer');
  var peerConnection = receivers[receiverId].peerConnection;

  peerConnection.createOffer().then(function(offer) {
      console.log("creating offer for ", receiverId);
      return peerConnection.setLocalDescription(offer);
  })
  .then(function(){
      sendMessage({
        type: 'offer',
        senderId: senderId,
        receiverId: receiverId,
        sdp: peerConnection.localDescription
      })
  });

}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}
