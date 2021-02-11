'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var peerConnection
var remoteStream;
var turnReady;
var myId;


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

////////////////////////////////////////////////////////////////////////////
let CameraProjectionMatrix = [[2390.3124, 0.0, 311.2871, 0.0], [0.0, 2371.8327, 236.7063, 0.0], [0.0, 0.0, 1.0, 0.0]];
let ProjectorProjectionMatrix = [[1110.2147, 11.1963, 427.6034, -28.3191], [8.0287, 2267.3260, 1125.1784, -318635.9264], [0.0042, 0.0297, 0.9996, -0.3256]];
let mCameraProjectionMatrix = new THREE.Matrix4( );
let mProjectorProjectionMatrix = new THREE.Matrix4( );
mCameraProjectionMatrix.set( 2390.3124, 0.0, 311.2871, 0.0, 0.0, 2371.8327, 236.7063, 0.0, 0.0, 0.0, 1.0, 0.0 );
mProjectorProjectionMatrix.set( 1110.2147, 11.1963, 427.6034, -28.3191, 8.0287, 2267.3260, 1125.1784, -318635.9264, 0.0042, 0.0297, 0.9996, -0.3256 );

function createMinPhase(zmin, fringePitch, w, h, cProj, pProj) {
  //let minPhase = new Array(h).fill(0).map(() => new Array(w).fill(0));
  let minPhase = new Float32Array(w*h);
  let A = [[0, 0],[0, 0]];
  let b = [0, 0];
  let uc;
  let vc;
  let xyzmin;
  let uvTemp;
  let up;

  for (uc = 0; uc < w; uc++)
  {
    for (vc = 0; vc < h; vc++)
    {
      A[0][0] = cProj[2][0]*uc - cProj[0][0];
      A[0][1] = cProj[2][1]*uc - cProj[0][1];
      A[1][0] = cProj[2][0]*vc - cProj[1][0];
      A[1][1] = cProj[2][1]*vc - cProj[1][1];

      b[0] = cProj[0][3] - cProj[2][3]*uc - (cProj[2][2]*uc-cProj[0][2])*zmin;
      b[1] = cProj[1][3] - cProj[2][3]*vc - (cProj[2][2]*vc-cProj[1][2])*zmin;

      xyzmin = math.multiply(math.inv(A), b);
      xyzmin.push(zmin);
      xyzmin.push(1);
      uvTemp = math.multiply(pProj, xyzmin);
      up = uvTemp[1]/uvTemp[2];
      //minPhase[vc][uc] = (up*2*Math.PI)/fringePitch;
      minPhase[(h-1-vc)*w+uc] = (up*2*Math.PI)/fringePitch;

    }
  }
  return minPhase; 
}

let minPhase = createMinPhase(350, 36*6, 640, 480, CameraProjectionMatrix, ProjectorProjectionMatrix);
let minPhaseTexture = new THREE.DataTexture(minPhase, 640, 480, THREE.RedFormat, THREE.FloatType);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

var remoteVideo = document.querySelector('#remoteVideo');

remoteVideo.addEventListener( 'loadeddata', function( event )
{
  //let texture = new THREE.VideoTexture( remoteVideo );
  const encodeImage = new THREE.TextureLoader().load( 'encodeImage.png' );

  var meshWidth   = 640;
  var meshHeight  = 480;
  var imageWidth  = 640;
  var imageHeight = 480;

  var uniforms =
  {
      imageWidth          : { value : imageWidth },
      imageHeight         : { value : imageHeight },
      piConst             : { value : Math.PI },
      twoPiConst          : { value : Math.PI * 2.0 },
      useLight            : { value : true },
      lightIntensity      : { value : 1.0 },
      specularAmount      : { value : 0.1 },
      specularExponent    : { value : 10.0 },
      //fragmentType        : { type : 'i', value : FragmentType.None },
      modelColorR         : { value : 255.0 / 255.0 },
      modelColorG         : { value : 220.0 / 255.0 },
      modelColorB         : { value : 165.0 / 255.0 },
      lightColorR         : { value : 1.0 },
      lightColorG         : { value : 1.0 },
      lightColorB         : { value : 1.0 },
      encodeImage         : { value : encodeImage },
      minPhaseTexture     : { value : minPhaseTexture },
      scalingFactor       : { value : 6.0},
      filterDist          : { value : 0.15 },
      camProjMat          : { value : mCameraProjectionMatrix },
      proProjMat          : { value : mProjectorProjectionMatrix },
      fringePitch         : { value : 36 }
  };


  const geometry = new THREE.PlaneBufferGeometry( meshWidth, meshHeight, imageWidth, imageHeight );
  //const material = new THREE.MeshBasicMaterial( { map: texture } );


  function vertexShader() {
    return `
        uniform sampler2D   encodeImage;
        uniform sampler2D   minPhaseTexture;
        uniform float       imageWidth;
        uniform float       imageHeight;
        uniform float       scalingFactor;
        uniform float       piConst;
        uniform float       twoPiConst;
        uniform mat4        camProjMat;
        uniform mat4        proProjMat;
        uniform float       fringePitch;

        varying vec2        vUv; 
        varying vec2        dataUV;
        varying vec4        vEncodeImage;
        varying vec4        vMinPhase;
        varying float       minPhase;
        varying float       test;
        varying mat3        A;
        varying vec3        b;

        mat3 inverseMatrix(mat3 m)
        {
            mat3 invm, m1;

            invm[0] = m[1].yzx*m[2].zxy - m[1].zxy*m[2].yzx;
            invm[1] = m[0].zxy*m[2].yzx - m[0].yzx*m[2].zxy;
            invm[2] = m[0].yzx*m[1].zxy - m[0].zxy*m[1].yzx;

            float det = dot(m[0], invm[0]);
            m1 = invm/det;
            // NOTE: Don't transpose because GLSL uses column wise operation
            // instead of row wise operation.
            return m1;
        }

        void main() {
          vec3 pos = position;

          dataUV = vec2(pos.x / imageWidth + 0.5, pos.y / imageHeight + 0.5);

          vEncodeImage = texture(encodeImage, dataUV);
          float encodeR = vEncodeImage.r;
          float encodeG = vEncodeImage.g;
          vMinPhase = texture(minPhaseTexture, dataUV);
          minPhase = vMinPhase.r;

          float wrappedPhase = atan(encodeR - 0.5, encodeG - 0.5);
          float k = floor((minPhase-wrappedPhase) / twoPiConst) + 1.0;
          float unWrappedPhase = (wrappedPhase + k*twoPiConst) * scalingFactor;
          test = unWrappedPhase/120.0;

          float uc = dataUV.x * imageWidth;
          float vc = (1.0 - dataUV.y) * imageHeight;
          float up = unWrappedPhase * fringePitch / twoPiConst;
          //float up = minPhase * scalingFactor * fringePitch / twoPiConst;


          for (int k = 0; k < 3; k ++)
          {
            A[k][0] = camProjMat[k][0] - uc * camProjMat[k][2]; 
            A[k][1] = camProjMat[k][1] - vc * camProjMat[k][2]; 
            A[k][2] = proProjMat[k][1] - up * proProjMat[k][2]; 
          }

          b[0] = uc * camProjMat[3][2] - camProjMat[3][0]; 
          b[1] = vc * camProjMat[3][2] - camProjMat[3][1]; 
          b[2] = up * proProjMat[3][2] - proProjMat[3][1];



          vec3 xyz = inverse(A)*b;
          test = xyz.x;

          vec4 modelViewPosition = modelViewMatrix * vec4(xyz, 1.0);
          gl_Position = projectionMatrix * modelViewPosition; 
        }
    `
  }

  function fragmentShader() {
    return `
      uniform sampler2D   phaseImage;
      uniform sampler2D   encodeImage;
      uniform float       imageWidth;
      uniform float       imageHeight;


      varying vec2        dataUV;
      varying vec4        vMinPhase;
      varying float       minPhase;
      varying float       test;
      uniform float       modelColorR;
      uniform float       modelColorG;
      uniform float       modelColorB;

      void main() {
        vec3 color;

        gl_FragColor = vec4(modelColorR, modelColorG, modelColorB, 1.0);
      }
  `
  }

  let material = new THREE.ShaderMaterial(
  {
      uniforms        : uniforms, 
      vertexShader    : vertexShader(),
      fragmentShader  : fragmentShader(),
      side            : THREE.BackSide
  } );

  const mesh = new THREE.Mesh( geometry, material );

  scene.add( mesh );
  camera.position.z = 600;
});


const animate = function () {
  requestAnimationFrame( animate );

  renderer.render( scene, camera );
};

animate();
////////////////////////////////////////////////////////////////////////////

socket_role = 'receiver';
if (room !== '') {
  socket.emit('create or join', {room: room, role:socket_role});
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room, receiverId) {
  myId = receiverId
  console.log('joined: ' + room);
  //createPeerConnection();
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
  if (message.type === 'got user media') {
    createPeerConnection();
  } else if (message.type === 'offer') {
    peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'sender candidate') {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    peerConnection.addIceCandidate(candidate);
    //peerConnection.addStream(localStream);
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
  sendMessage({type: 'got user media', peerId: myId});
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

function createPeerConnection() {
  try {

    peerConnection = new RTCPeerConnection(null);

    peerConnection.onicecandidate = function(event) {
      console.log('icecandidate event: ', event);
      if (event.candidate) {
        sendMessage({
          type: 'receiver candidate',
          receiverId: myId,
          label: event.candidate.sdpMLineIndex,
          id: event.candidate.sdpMid,
          candidate: event.candidate.candidate
        });
      } else {
        console.log('End of candidates.');
      }
    }
    peerConnection.onaddstream = handleRemoteStreamAdded;
    peerConnection.onremovestream = handleRemoteStreamRemoved;
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


function doAnswer() {
  console.log('Sending answer to sender.');
  peerConnection.createAnswer().then(function(answer) {
      console.log("creating answer for sender");
      return peerConnection.setLocalDescription(answer);
  })
  .then(function(){
      sendMessage({
        type: 'answer',
        receiverId: myId,
        sdp: peerConnection.localDescription
      })
  });
}

function setLocalAndSendMessage(sessionDescription) {
  peerConnection.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}
