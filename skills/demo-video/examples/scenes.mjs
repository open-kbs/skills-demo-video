// Example edit plan for compose.mjs (fictional shop "PartsHub24" with an AI assistant "Alex").
// Copy to video/scenes.mjs and adapt. Receives helpers:
//   marks(take) → { label: seconds } from video/build/rec/<take>.marks (written by `mark` while recording)
//   dur(file)   → seconds;  vo(id) → path of the voice-over wav;  B(...) → path under video/build/
// Scene: { id, chapter?, cap?: 'left', tail?, pieces: [[take, in, out|null, speed, zoom?]], audio: [['vo:s01', at] | [file, at, caption?]], sfx: [[name, take, t]] }
//   pieces: cuts of a take in source seconds, played at `speed` (2–5 for waiting), optional zoom = key of `zooms` or {x,y,w,h} in source px
//   audio: 'vo:<id>' = narrator line (captions from narrator.json); a plain file plays without captions unless a caption text is given
//   sfx: a sound from video/build/sfx at source time t of a take (mapped through the speed-ups)
export default ({ marks, dur, vo, B }) => {
  const S = marks('shop'), C = marks('checkout'), T1 = marks('track1'), E = marks('erp'), A = marks('ai');
  const n = dur(vo('s07')) + 0.9, q = dur(B('voice', 'customer.wav'));   // voice card timeline (see examples/voice-exchange.mjs)
  return {
    name: 'PartsHub24-demo',                 // → video/out/PartsHub24-demo.mp4
    output: { w: 1920, h: 1080 },
    zooms: { chat: { x: 533, y: 255, w: 1067, h: 600 } },   // bottom-right chat panel of a 1600×900 take → 1.5× punch-in
    captions: { chipColor: '#e0102f' },      // fonts: Golos Text + Fira Sans Extra Condensed from setup.sh
    // music: 'video/music/track.mp3',       // own track (looped); omit = synthesized bed; null = no music
    scenes: [
      { id: 'intro', pieces: [['card-intro', 0, null, 1]],
        audio: [['vo:s01', 0.6], ['vo:s02', dur(vo('s01')) + 1.3]] },
      { id: 'search', chapter: 'Online shop', pieces: [['search', 0.3, null, 1]],
        audio: [['vo:s03', 0.5]] },
      { id: 'chat1', cap: 'left', chapter: 'AI assistant "Alex"', pieces: [
          ['shop', S.chat_open, S.q1, 1], ['shop', S.q1, S.q1_sent, 1.3, 'chat'],
          ['shop', S.q1_sent, S.a1 - 1, 3, 'chat'], ['shop', S.a1 - 1, S.q2, 1, 'chat']],
        audio: [['vo:s04', 0.3], ['vo:s05', 7.4]] },
      { id: 'chat2', cap: 'left', pieces: [
          ['shop', S.q2, S.q2_sent, 2.5, 'chat'], ['shop', S.q2_sent, S.a2 - 0.8, 4, 'chat'], ['shop', S.a2 - 0.8, S.q3, 1, 'chat'],
          ['shop', S.q3, S.q3_sent, 3, 'chat'], ['shop', S.q3_sent, S.a3 - 0.8, 5, 'chat'], ['shop', S.a3 - 0.8, S.end - 0.8, 1]],
        sfx: [['chime', 'shop', S.a3 - 0.7]],
        audio: [['vo:s06', 0.4]] },
      { id: 'voice', chapter: 'Alex talks', pieces: [['card-voice', 0, null, 1]],
        audio: [['vo:s07', 0.4], ['video/build/voice/customer.wav', n], ['video/build/voice/assistant.wav', n + q + 1.2]] },
      { id: 'checkout', chapter: 'Checkout', pieces: [
          ['checkout', 0.5, C.form, 2], ['checkout', C.form, C.payment, 3], ['checkout', C.payment, C.submit, 2], ['checkout', C.submit, C.thanks - 1.2, 3], ['checkout', C.thanks - 1.2, C.end, 1]],
        sfx: [['chime', 'checkout', C.thanks - 1]],
        audio: [['vo:s08', 0.4]] },
      { id: 'track1', pieces: [['track1', 0.5, T1.check, 2], ['track1', T1.check, T1.end, 1]],
        audio: [['vo:s09', 0.3]] },
      { id: 'erp', chapter: 'ERP back office', pieces: [
          ['erp', 0.3, E.orders, 1], ['erp', E.orders, E.waybill, 1], ['erp', E.waybill, E.create, 2], ['erp', E.create, E.end, 1]],
        sfx: [['chime', 'erp', E.create + 1.2]],
        audio: [['vo:s10', 0.3], ['vo:s11', 7.6]] },
      { id: 'track2', pieces: [['track2', 0.4, null, 1]],
        audio: [['vo:s12', 1.6]] },
      { id: 'ai', chapter: 'AI analyst', pieces: [
          ['ai', 0.5, A.sent, 1.6], ['ai', A.sent, A.answered, 2.5], ['ai', A.answered, A.end, 1]],
        audio: [['vo:s13', 0.3]] },
      { id: 'tour', chapter: 'All in one system', pieces: [['tour', 0.2, null, 1.6]],
        audio: [['vo:s14', 0.4]] },
      { id: 'outro', pieces: [['card-outro', 0, null, 1]],
        audio: [['vo:s15', 0.8]] },
    ],
  };
};
