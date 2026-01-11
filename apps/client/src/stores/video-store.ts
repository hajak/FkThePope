import { create } from 'zustand';
import type { PlayerPosition, RTCOfferAnswer, RTCIceCandidate as SharedRTCIceCandidate } from '@fkthepope/shared';
import { getSocket } from '../socket/socket-client';

// STUN servers for NAT traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

interface VideoStore {
  localStream: MediaStream | null;
  remoteStreams: Record<PlayerPosition, MediaStream | null>;
  peerConnections: Record<PlayerPosition, RTCPeerConnection | null>;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  playerMuteStatus: Record<PlayerPosition, boolean>; // Track who is muted
  error: string | null;

  // Actions
  startVideo: () => Promise<void>;
  stopVideo: () => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
  setPlayerMuteStatus: (player: PlayerPosition, isMuted: boolean) => void;
  initializePeerConnection: (position: PlayerPosition) => RTCPeerConnection;
  handleOffer: (from: PlayerPosition, offer: RTCOfferAnswer) => Promise<void>;
  handleAnswer: (from: PlayerPosition, answer: RTCOfferAnswer) => Promise<void>;
  handleIceCandidate: (from: PlayerPosition, candidate: SharedRTCIceCandidate) => Promise<void>;
  sendOffer: (to: PlayerPosition) => Promise<void>;
  cleanup: () => void;
}

export const useVideoStore = create<VideoStore>((set, get) => ({
  localStream: null,
  remoteStreams: {
    north: null,
    east: null,
    south: null,
    west: null,
  },
  peerConnections: {
    north: null,
    east: null,
    south: null,
    west: null,
  },
  isVideoEnabled: true,
  isAudioEnabled: true,
  playerMuteStatus: {
    north: false,
    east: false,
    south: false,
    west: false,
  },
  error: null,

  startVideo: async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // Add tracks to any existing peer connections
      const { peerConnections } = get();
      Object.values(peerConnections).forEach(pc => {
        if (pc) {
          stream.getTracks().forEach(track => {
            // Check if track is already added
            const senders = pc.getSenders();
            const trackAlreadyAdded = senders.some(sender => sender.track === track);
            if (!trackAlreadyAdded) {
              pc.addTrack(track, stream);
            }
          });
        }
      });

      set({ localStream: stream, error: null });
    } catch (err) {
      set({ error: 'Failed to access camera/microphone' });
      console.error('Failed to get media devices:', err);
    }
  },

  stopVideo: () => {
    const { localStream, peerConnections } = get();

    // Stop all tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    // Close all peer connections
    Object.values(peerConnections).forEach(pc => {
      if (pc) pc.close();
    });

    set({
      localStream: null,
      remoteStreams: { north: null, east: null, south: null, west: null },
      peerConnections: { north: null, east: null, south: null, west: null },
    });
  },

  toggleVideo: () => {
    const { localStream, isVideoEnabled } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isVideoEnabled;
      });
      set({ isVideoEnabled: !isVideoEnabled });
    }
  },

  toggleAudio: () => {
    const { localStream, isAudioEnabled } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioEnabled;
      });
      const newMuteState = isAudioEnabled; // If audio was enabled, we're now muted
      set({ isAudioEnabled: !isAudioEnabled });
      // Broadcast mute status to other players
      getSocket().emit('mute-status', { isMuted: newMuteState });
    }
  },

  setPlayerMuteStatus: (player: PlayerPosition, isMuted: boolean) => {
    set(state => ({
      playerMuteStatus: {
        ...state.playerMuteStatus,
        [player]: isMuted,
      },
    }));
  },

  initializePeerConnection: (position: PlayerPosition) => {
    const { peerConnections, localStream } = get();

    // Close existing connection if any
    if (peerConnections[position]) {
      peerConnections[position]!.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks to the connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      set(state => ({
        remoteStreams: {
          ...state.remoteStreams,
          [position]: remoteStream,
        },
      }));
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('webrtc-ice-candidate', {
          to: position,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${position}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        // Clear the remote stream
        set(state => ({
          remoteStreams: {
            ...state.remoteStreams,
            [position]: null,
          },
        }));
        // Try to reconnect after a short delay
        setTimeout(() => {
          const { localStream } = get();
          if (localStream) {
            console.log(`Attempting to reconnect with ${position}`);
            get().sendOffer(position);
          }
        }, 2000);
      } else if (pc.connectionState === 'disconnected') {
        // Connection temporarily lost, wait for ICE to reconnect
        console.log(`Connection with ${position} disconnected, waiting for reconnect...`);
      }
    };

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${position}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        // Restart ICE
        pc.restartIce();
      }
    };

    set(state => ({
      peerConnections: {
        ...state.peerConnections,
        [position]: pc,
      },
    }));

    return pc;
  },

  sendOffer: async (to: PlayerPosition) => {
    const pc = get().initializePeerConnection(to);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      getSocket().emit('webrtc-offer', {
        to,
        offer: pc.localDescription!.toJSON(),
      });
    } catch (err) {
      console.error('Failed to send offer:', err);
    }
  },

  handleOffer: async (from: PlayerPosition, offer: RTCOfferAnswer) => {
    const pc = get().initializePeerConnection(from);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer as RTCSessionDescriptionInit));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      getSocket().emit('webrtc-answer', {
        to: from,
        answer: pc.localDescription!.toJSON(),
      });
    } catch (err) {
      console.error('Failed to handle offer:', err);
    }
  },

  handleAnswer: async (from: PlayerPosition, answer: RTCOfferAnswer) => {
    const { peerConnections } = get();
    const pc = peerConnections[from];

    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer as RTCSessionDescriptionInit));
      } catch (err) {
        console.error('Failed to handle answer:', err);
      }
    }
  },

  handleIceCandidate: async (from: PlayerPosition, candidate: SharedRTCIceCandidate) => {
    const { peerConnections } = get();
    const pc = peerConnections[from];

    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate as RTCIceCandidateInit));
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    }
  },

  cleanup: () => {
    get().stopVideo();
  },
}));
