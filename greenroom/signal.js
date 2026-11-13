(function (root) {
  'use strict';
  var SCORER_VERSION = 'post-v1';
  var METER_VERSION = 'pitch-v1';
  var DAY_MS = 86400000;
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayMs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s));
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return t;
  }
  function isDay(s) { return dayMs(s) !== null; }
  function dayOf(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function addDays(day, n) { var t = dayMs(day); return t === null ? null : dayOf(t + Math.round(n) * DAY_MS); }
  function daysBetween(a, b) { var x = dayMs(a), y = dayMs(b); return x === null || y === null ? null : Math.round((y - x) / DAY_MS); }
  function weekdayOf(day) { var t = dayMs(day); return t === null ? null : new Date(t).getUTCDay(); }
  function mondayOf(day) { var w = weekdayOf(day); return w === null ? null : addDays(day, -((w + 6) % 7)); }
  function dayIn(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? pacificParts(v).date : null;
    var s = String(v).trim();
    if (isDay(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { var t = Date.parse(s); return isFinite(t) ? pacificParts(t).date : null; }
    return null;
  }
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayWords(day) {
    var t = dayMs(day); if (t === null) return '';
    var d = new Date(t);
    return DOW[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate();
  }
  function dueWords(left) {
    if (left === null || left === undefined) return '';
    if (left === 0) return 'today';
    if (left === 1) return 'tomorrow';
    if (left === -1) return 'yesterday';
    return left > 0 ? 'in ' + left + ' days' : (-left) + ' days ago';
  }
  function offsetWords(n, base) {
    var what = base === 'video' ? 'the video' : 'release';
    if (n === 0) return base === 'video' ? 'the day the video comes out' : 'release day';
    var d = Math.abs(n) + (Math.abs(n) === 1 ? ' day ' : ' days ');
    return d + (n < 0 ? 'before ' : 'after ') + what;
  }
  var LA = 'America/Los_Angeles';
  var laFormat = null;
  function laIntl(ms) {
    try {
      if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) return null;
      if (!laFormat) {
        laFormat = new Intl.DateTimeFormat('en-US', { timeZone: LA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      }
      if (!laFormat.formatToParts) return null;
      var o = {};
      laFormat.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
      var y = +o.year, mo = +o.month, d = +o.day, h = (+o.hour) % 24, mi = +o.minute;
      if (!y || !mo || !d || isNaN(h) || isNaN(mi)) return null;
      return { y: y, m: mo, d: d, h: h, min: mi };
    } catch (e) { return null; }
  }
  function sundayOf(y, month0, n) {
    var first = new Date(Date.UTC(y, month0, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 7 * (n - 1);
  }
  function laOffsetHours(ms) {
    var y = new Date(ms).getUTCFullYear();
    var start = Date.UTC(y, 2, sundayOf(y, 2, 2), 10);
    var end = Date.UTC(y, 10, sundayOf(y, 10, 1), 9);
    return ms >= start && ms < end ? -7 : -8;
  }
  function laRule(ms) {
    var t = new Date(ms + laOffsetHours(ms) * 3600000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() };
  }
  function pacificParts(ms, opts) {
    var p = opts && opts.noIntl ? null : laIntl(ms), via = 'intl';
    if (!p) { p = laRule(ms); via = 'rule'; }
    var date = p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
    return { date: date, time: pad2(p.h) + ':' + pad2(p.min), weekday: weekdayOf(date), hour: p.h, minute: p.min, via: via };
  }
  function pacificInstant(date, time, opts) {
    var a = dayMs(date), m = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
    if (a === null || !m || +m[1] > 23 || +m[2] > 59) return null;
    var target = a + (+m[1]) * 3600000 + (+m[2]) * 60000, guess = target + 8 * 3600000;
    for (var i = 0; i < 3; i++) {
      var p = pacificParts(guess, opts);
      guess += target - (dayMs(p.date) + p.hour * 3600000 + p.minute * 60000);
    }
    return guess;
  }
  function postWhen(w, opts) {
    w = w || {};
    var release = !!w.release, p, date, time;
    if (typeof w.at === 'number' && isFinite(w.at)) {
      p = pacificParts(w.at, opts);
      return { date: p.date, time: p.time, weekday: p.weekday, hour: p.hour, release: release, instant: w.at };
    }
    date = String(w.date || ''); time = String(w.time || '').slice(0, 5);
    if (!isDay(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    return { date: date, time: time, weekday: weekdayOf(date), hour: +time.split(':')[0], release: release, instant: pacificInstant(date, time, opts) };
  }
  function codePoints(s) { return String(s).match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g) || []; }
  var PostScore = (function () {
    var DEFS = {
      photo: {
        name: "Photo or carousel", caption: true,
        gates: [
          {id: "own", label: "My own photo, design or a real edit", hint: "Not a reposted flyer, line-up, press screenshot or someone else’s photo"},
          {id: "nowm", label: "No visible watermark"}
        ],
        factors: [
          {id: "format", label: "Format and sequence", max: 18, options: [
            {v: "c3", pts: 18, label: "Carousel, 3+ strong frames"},
            {v: "c2", pts: 12, label: "2 frames, or some filler"},
            {v: "single", pts: 6, label: "Single photo, strong alone"},
            {v: "flat", pts: 2, label: "Lone flat graphic, like cover art"}],
            fix: "Make it a carousel of 3+ strong frames, with a second opener on slide 2."},
          {id: "send", label: "Worth sending", max: 14, options: [
            {v: "news", pts: 14, label: "News or a moment fans pass on"},
            {v: "nice", pts: 7, label: "Nice, but no reason to share"},
            {v: "ad", pts: 0, label: "Pure ad"}],
            fix: "Give fans a reason to DM it: a release, date or show, an in-joke, a moment."},
          {id: "first", label: "First frame stops the scroll", max: 12, options: [
            {v: "strong", pts: 12, label: "A person or a striking moment"},
            {v: "generic", pts: 6, label: "Decent but generic"},
            {v: "flat", pts: 0, label: "Blurry, text-heavy or flat"}],
            hint: "Full points also mean short title or date text on announcements, and a slide 2 that works as a second opener.",
            fix: "Open on a person or a striking real moment, with short title or date text on announcements."},
          {id: "music", label: "Music on the post", max: 10, options: [
            {v: "mine", pts: 10, label: "My track from the library"},
            {v: "other", pts: 5, label: "Another fitting song"},
            {v: "none", pts: 0, label: "No music"}],
            fix: "Add your track as the post’s music so it can show in the Reels tab."},
          {id: "caption", label: "Caption", max: 10, type: "caption"},
          {id: "collab", label: "Collab, tags and location", max: 8, options: [
            {v: "full", pts: 8, label: "Collab + photographer or venue tagged"},
            {v: "collab", pts: 6, label: "Collab only"},
            {v: "tags", pts: 4, label: "Tags only"},
            {v: "none", pts: 0, label: "None"}],
            fix: "Invite the featured artist, label or promoter as a Collab, and tag the photographer and venue."},
          {id: "quality", label: "Image quality and fit", max: 8, options: [
            {v: "tall", pts: 8, label: "3:4 or 4:5, sharp"},
            {v: "wide", pts: 4, label: "Square or landscape"},
            {v: "poor", pts: 0, label: "Blurry or a screenshot"}],
            fix: "Export at 3:4 (1080×1440), sharp, with key content clear of the grid’s side crop."},
          {id: "raw", label: "Raw and human", max: 6, options: [
            {v: "raw", pts: 6, label: "Candid moment with me in it"},
            {v: "polished", pts: 3, label: "Polished press shot"},
            {v: "none", pts: 0, label: "Generic visual"}],
            fix: "Lead with a candid, real moment from your world, with you in it."},
          {id: "reply", label: "Reply plan", max: 4, type: "check", check: "I’ll answer comments in the first few hours",
            fix: "Be around to answer comments in the first few hours."},
          {id: "day", label: "Day", max: 4, type: "day"},
          {id: "time", label: "Time", max: 6, type: "time"}
        ]
      },
      reel: {
        name: "Reel", caption: true, length: true,
        gates: [
          {id: "own", label: "My own footage or a real edit of it"},
          {id: "nowm", label: "No other app’s watermark or logo", hint: "TikTok, CapCut and similar"},
          {id: "vertical", label: "Vertical 9:16, no borders or black bars"},
          {id: "sharp", label: "Sharp, not blurry"},
          {id: "sound", label: "Sound on"},
          {id: "text", label: "Text doesn’t cover most of the frame"}
        ],
        factors: [
          {id: "hook", label: "Hook in the first second", max: 20, options: [
            {v: "full", pts: 20, label: "The payoff opens it, plus a reason to stay"},
            {v: "late", pts: 10, label: "Payoff after a second, or no reason to stay"},
            {v: "slow", pts: 0, label: "Logo, fade-in or slow build"}],
            fix: "Open on the drop, a striking sound, hands on gear or a crowd moment, plus one line that gives a reason to stay."},
          {id: "hold", label: "Holds to the end", max: 20, options: [
            {v: "full", pts: 20, label: "Early payoff, later reveal or a seamless loop"},
            {v: "some", pts: 10, label: "Some dead spots"},
            {v: "late", pts: 0, label: "Payoff after 20 seconds"}],
            fix: "Put the payoff early, add a second reveal or make it loop, and fit the length to the idea (7–90 s)."},
          {id: "send", label: "Worth sending", max: 15, options: [
            {v: "yes", pts: 15, label: "A trick, reveal, first listen or news"},
            {v: "nice", pts: 7, label: "Nice but generic"},
            {v: "ad", pts: 0, label: "Pure ad"}],
            fix: "Make it worth a DM: a trick, a demo-versus-final reveal, a first listen or a date."},
          {id: "audio", label: "Audio", max: 10, options: [
            {v: "mine", pts: 10, label: "My released track from the library"},
            {v: "trend", pts: 5, label: "Trending sound unrelated to me"},
            {v: "unlicensed", pts: 0, label: "Someone else’s track, unlicensed"}],
            hint: "Original audio counts as full points for music that isn’t out yet.",
            fix: "Use your released track from Instagram’s music library, or original audio for unreleased music."},
          {id: "human", label: "Human and recognisably you", max: 10, options: [
            {v: "full", pts: 10, label: "Face, voice or hands, my name, part of a series"},
            {v: "some", pts: 5, label: "Some of these"},
            {v: "none", pts: 0, label: "Faceless visualizer"}],
            fix: "Show your face, voice or hands, put your name on screen, and make it a recurring series."},
          {id: "ontext", label: "On-screen text", max: 6, options: [
            {v: "one", pts: 6, label: "One short line in the safe zone"},
            {v: "crowded", pts: 3, label: "Crowded, or under the buttons"},
            {v: "none", pts: 0, label: "No text"}],
            fix: "Add one short, legible line, clear of the top 14% and bottom 35% where buttons sit."},
          {id: "caption", label: "Caption and hashtags", max: 5, type: "caption"},
          {id: "collab", label: "Collab and tags", max: 4, type: "check", check: "Collab with the featured artist or label, or the real collaborators tagged",
            fix: "Invite the featured artist or label as a Collab, or tag the real collaborators."},
          {id: "cover", label: "Cover", max: 3, type: "check", check: "Title readable inside the centre 3:4 crop of my grid",
            fix: "Pick a cover whose title reads inside the centre 3:4 crop of your grid."},
          {id: "setup", label: "Posting setup", max: 2, type: "check", check: "Trial Reel when testing a hook; the app or Edits when the audio must start on the drop",
            fix: "Post hook tests as Trial Reels, and use the app or Edits when the audio must start on the drop."},
          {id: "day", label: "Day", max: 2, type: "day"},
          {id: "time", label: "Time", max: 3, type: "time"}
        ]
      },
      story: {
        name: "Story", caption: false,
        gates: [],
        factors: [
          {id: "hook", label: "Frame 1 hook", max: 20, options: [
            {v: "full", pts: 20, label: "Grabs in a second"},
            {v: "slow", pts: 10, label: "Slow start"},
            {v: "bare", pts: 0, label: "A bare link or a wall of text"}],
            hint: "You on camera, the drop, or a bold one-line promise.",
            fix: "Make frame 1 the hook: you on camera, the drop, or a bold one-line promise."},
          {id: "reply", label: "Invites a reply or DM", max: 20, options: [
            {v: "full", pts: 20, label: "Question sticker, “reply with…” or a Reveal sticker"},
            {v: "implied", pts: 10, label: "Only implied"},
            {v: "none", pts: 0, label: "Nothing to answer"}],
            fix: "Ask for a reply outright: a question sticker, “reply with a fire emoji for the link”, or a Reveal sticker."},
          {id: "sticker", label: "One-tap sticker", max: 12, type: "check", check: "A poll, emoji slider or quiz on at least one frame",
            fix: "Add a poll, emoji slider or quiz to one frame."},
          {id: "frames", label: "Right number of frames", max: 10, type: "frames"},
          {id: "next", label: "One clear next step", max: 10, type: "check", check: "One ask: a link sticker after the hook, or a pointer to the new Reel",
            fix: "Give one next step: a link sticker after the hook, with a short call to action."},
          {id: "music", label: "Music built in", max: 8, type: "check", check: "A Spotify share with preview, a music sticker with my track, or a countdown before release",
            fix: "Build the music in: share the track from Spotify, add a music sticker, or run a countdown before release."},
          {id: "raw", label: "Moving, raw and you", max: 10, options: [
            {v: "video", pts: 10, label: "Mostly video, in the moment, with me in it"},
            {v: "stills", pts: 5, label: "Mostly stills"},
            {v: "ads", pts: 0, label: "Polished ad graphics only"}],
            fix: "Shoot it in the moment, mostly video, with you visible or audible."},
          {id: "reshare", label: "Reshares add something", max: 4, type: "check", check: "No bare reshares: reshared posts carry context, a poll or a call to action",
            fix: "Don’t reshare bare: add context, a poll or a call to action."},
          {id: "day", label: "Day", max: 2, type: "day"},
          {id: "time", label: "Time of first frame", max: 4, type: "time"}
        ]
      }
    };
    var BANDS = [
      {min: 85, key: "ready", name: "Ready", say: "Post it. The big levers are in place.", tone: "pos"},
      {min: 70, key: "good", name: "Good", say: "Fix the cheapest missing item, then post.", tone: "ink"},
      {min: 55, key: "work", name: "Needs work", say: "Fix the top one or two items before posting.", tone: "part"},
      {min: 0, key: "rethink", name: "Rethink", say: "Try a new hook or a different format.", tone: "neg"}
    ];
    function band(t) { for (var i = 0; i < BANDS.length; i++) { if (t >= BANDS[i].min) return BANDS[i]; } return BANDS[BANDS.length - 1]; }
    var DAY_PTS = {photo: [2, 3, 4, 4, 4, 2, 1], reel: [2, 2, 2, 2, 2, 1, 1], story: [2, 2, 2, 2, 2, 2, 1]};
    var TIME_BANDS = {
      photo: [[3, 2], [5, 3], [10, 5], [16, 6], [21, 5], [24, 3]],
      reel: [[3, 1], [8, 2], [19, 3], [21, 2], [24, 1]],
      story: [[3, 1], [5, 2], [8, 3], [13, 4], [16, 3], [21, 2], [24, 1]]
    };
    var BEST_DAYS = {photo: "Tuesday to Thursday", reel: "Sunday to Thursday", story: "any day but Saturday"};
    var BEST_TIME = {photo: "10 a.m. and 4 p.m.", reel: "8 a.m. and 7 p.m.", story: "8 a.m. and 1 p.m."};
    function dayMax(fmt) { return Math.max.apply(null, DAY_PTS[fmt]); }
    function timeMax(fmt) { return Math.max.apply(null, TIME_BANDS[fmt].map(function (b) { return b[1]; })); }
    function dayPts(fmt, wd, release) { return release ? dayMax(fmt) : DAY_PTS[fmt][wd]; }
    function timePts(fmt, hour) { var b = TIME_BANDS[fmt]; for (var i = 0; i < b.length; i++) { if (hour < b[i][0]) return b[i][1]; } return b[b.length - 1][1]; }
    function framesPts(n, release) {
      n = Math.floor(+n || 0);
      if (n < 1 || n > 10) return 0;
      if (release ? (n >= 3 && n <= 7) : n <= 3) return 10;
      return 5;
    }
    var BAIT = [
      /\b[Cc]omment\s+["“‘']?(?:[A-Z]{2,}\b|\d+\b|[☀-➿]|[\uD83C-\uDBFF][\uDC00-\uDFFF])/,
      /\btag\s+(?:\d+|a|one|two|three|your|some)\s+(?:friends?|people|homies|someone)\b/i,
      /\bshare\s+(?:this|it)\s+(?:to|on|in)\s+your\s+stor(?:y|ies)\b/i,
      /\bdouble[\s-]?tap\b/i,
      /\blike\s+(?:this|if)\b/i,
      /\bfollow\s+(?:me\s+)?for\s+(?:more|part)\b/i
    ];
    function analyzeCaption(text) {
      text = String(text || "");
      var mentions = (text.match(/@[A-Za-z0-9._]+/g) || []).map(function (m) { return m.replace(/\.+$/, ""); });
      var bait = [];
      BAIT.forEach(function (re) { var m = text.match(re); if (m) bait.push(m[0].trim()); });
      var flat = text.replace(/\s*\n+\s*/g, " ").trim();
      return {
        chars: codePoints(text).length,
        mentions: mentions,
        uniqueMentions: mentions.filter(function (m, i) { return mentions.indexOf(m) === i; }),
        hashtags: text.match(/#[^\s#@.,!?;:]+/g) || [],
        question: /\?|\b(?:let me know|tell me|what do you think|which one|reply with|drop (?:a|your))\b/i.test(text),
        bait: bait,
        linkInBio: /link in (?:my )?bio/i.test(text),
        preview: codePoints(flat).slice(0, 125).join("")
      };
    }
    function captionParts(fmt, cap, self) {
      self = self || {};
      var q = cap.question || !!self.question, noBait = cap.bait.length === 0 || !!self.baitOk, tags = cap.hashtags.length <= 5;
      if (fmt === "photo") return [
        {label: "First line is the hook", ok: !!self.hook, pts: 2, fix: "Put the hook in the first line. It’s all people see before “more”."},
        {label: "Names the artist, track, genre and city", ok: !!self.keywords, pts: 2, fix: "Name the artist, track, genre and city in plain words. Captions feed Instagram and Google search."},
        {label: "People involved are @mentioned", ok: cap.mentions.length > 0, pts: 2, fix: "@mention the people involved."},
        {label: "Asks one real question", ok: q, pts: 2, fix: "Ask one real question people can answer."},
        {label: "5 hashtags or fewer", ok: tags, pts: 1, fix: "Cut to 5 hashtags or fewer. Instagram blocks more."},
        {label: "No engagement bait", ok: noBait, pts: 1, fix: "Remove bait such as “comment FIRE” or “tag 3 friends”."}
      ];
      return [
        {label: "Hook line first, with plain keywords", ok: !!self.hook && !!self.keywords, pts: 1, fix: "Open the caption with the hook and plain keywords: the track and the genre."},
        {label: "Asks one real question", ok: q, pts: 1, fix: "Ask one real question."},
        {label: "5 hashtags or fewer", ok: tags, pts: 1, fix: "Cut to 5 hashtags or fewer."},
        {label: "Under about 500 characters", ok: cap.chars <= 500, pts: 1, fix: "Trim the caption to under about 500 characters."},
        {label: "No engagement bait", ok: noBait, pts: 1, fix: "Remove bait such as “comment FIRE”."}
      ];
    }
    function score(fmt, st, ctx) {
      var def = DEFS[fmt], cap = analyzeCaption(st.caption);
      var gatesFailed = (def.gates || []).filter(function (g) { return st.gates && st.gates[g.id] === false; }).map(function (g) { return g.label; });
      if (def.length && +st.lengthSec > 180) gatesFailed.push("3:00 or shorter");
      var items = def.factors.map(function (f) {
        var it = {id: f.id, label: f.label, max: f.max, earned: 0, fix: f.fix || ""};
        if (f.type === "caption") {
          var parts = captionParts(fmt, cap, st.self);
          it.parts = parts;
          parts.forEach(function (p) { if (p.ok) it.earned += p.pts; });
          var miss = parts.filter(function (p) { return !p.ok; });
          it.fix = miss.length ? miss[0].fix : "";
        } else if (f.type === "check") {
          it.earned = st[f.id] ? f.max : 0;
        } else if (f.type === "frames") {
          var n = Math.floor(+st.frames || 0);
          it.earned = framesPts(n, ctx.release);
          it.fix = n > 10 ? "Cut to 10 frames or fewer. Viewers drop off on long runs of similar frames." : (ctx.release ? "Post 3–7 frames on a release day." : "Keep ordinary days to 1–3 frames.");
        } else if (f.type === "day") {
          it.earned = dayPts(fmt, ctx.weekday, ctx.release);
          it.fix = "Post on " + BEST_DAYS[fmt] + ". Release day always earns full points.";
        } else if (f.type === "time") {
          it.earned = timePts(fmt, ctx.hour);
          it.fix = "Post between " + BEST_TIME[fmt] + " Pacific.";
        } else {
          var o = (f.options || []).filter(function (x) { return x.v === st[f.id]; })[0];
          it.earned = o ? o.pts : 0;
          if (!o) it.fix = "Pick an answer. " + (f.fix || "");
        }
        return it;
      });
      var raw = items.reduce(function (s, it) { return s + it.earned; }, 0);
      var total = gatesFailed.length ? Math.min(raw, 40) : raw;
      var moves = items.filter(function (it) { return it.earned < it.max; })
        .map(function (it) { return {id: it.id, label: it.label, gain: it.max - it.earned, fix: it.fix}; })
        .sort(function (a, b) { return b.gain - a.gain; });
      return {fmt: fmt, raw: raw, total: total, gatesFailed: gatesFailed, items: items, moves: moves, band: band(total), cap: cap};
    }
    return {DEFS: DEFS, BANDS: BANDS, score: score, analyzeCaption: analyzeCaption, timePts: timePts, dayPts: dayPts, timeMax: timeMax, dayMax: dayMax,
      band: band, VERSION: SCORER_VERSION};
  })();
  var PITCH_FIELDS = ['title', 'artists', 'release', 'home', 'based', 'genres', 'styles', 'cultures', 'moods', 'instruments',
    'cover', 'remix', 'recording', 'instrumental', 'language'];
  var PITCH_LISTS = { genres: true, styles: true, cultures: true, moods: true, instruments: true };
  function pitchInput(release, draft) {
    release = release || {}; draft = draft || {};
    var p = {};
    PITCH_FIELDS.forEach(function (k) {
      var v = draft[k] !== undefined ? draft[k] : release[k];
      if (PITCH_LISTS[k]) p[k] = Object.prototype.toString.call(v) === '[object Array]' ? v.slice() : [];
      else p[k] = v == null ? '' : v;
    });
    p.submit = draft.submit || '';
    p.text = draft.text || '';
    var ask = draft.ask || {}, prof = draft.profile || release.profile || {};
    p.ask = { genresHonest: !!ask.genresHonest, tagsMatch: !!ask.tagsMatch, readsClearly: !!ask.readsClearly, approved: !!ask.approved };
    p.profile = { canvas: !!prof.canvas, bio: !!prof.bio, presave: !!prof.presave, pick: !!prof.pick };
    return p;
  }
  var PITCH_NOT_YET = [
    { key: 'wrongtags', words: 'Wrong tags: 5 to 10 points off, and the total held at 60' },
    { key: 'invented', words: 'Claims that are not true: 5 points off' },
    { key: 'contradicts', words: 'Words that say something the tags do not: 3 points off' },
    { key: 'typos', words: 'Typos: 2 points off' }
  ];
  var PitchScore = (function(){
    var BROAD = ["electronic","dance","edm","electronica","electropop","pop","dance pop","hip hop","rock","r&b","alternative","indie","rap","latin","country"];
    var GENERIC_INSTR = ["synthesizer","samples","drum kit"];
    var TEMPO = /\b\d{2,3}\s?bpm\b|\btempo\b|\bhalf-?time\b|\bdouble-?time\b/i;
    var FEEL = /\b(dark|darker|heavy|brooding|menacing|euphoric|uplifting|melancholic|melancholy|moody|gritty|grimy|hypnotic|aggressive|fierce|dreamy|lush|warm|cold|icy|eerie|haunting|ominous|sinister|playful|sultry|raw|cinematic|emotional|nostalgic|ethereal|frantic|explosive|tense|bright|blissful|somber|sombre|anthemic|defiant)\b/i;
    var GENRE_WORDS = /\b(bass|house|techno|dubstep|drum (and|&) bass|dnb|d&b|trap|garage|trance|electro|edm|hip[- ]hop|rap|pop|rock|r&b|jungle|breakbeat|ambient|downtempo|footwork|phonk|hardstyle|riddim|wave|synthwave|disco|grime|drill|afrobeats?|amapiano|reggaeton|club|electronic|electronica|dance)\b/i;
    var SIGNATURE = /\b(percussion|drums?|tabla|sitar|dhol|dholak|harmonium|synths?|synthesizers?|vocals?|voices?|choir|strings|piano|keys|guitars?|bassline|808s?|samples?|sampled|horns?|brass|flute|bells|chants?|organ|breaks|kicks?|claps?)\b/i;
    var PRODUCTION = /\b(sound design|distorted|distortion|glitch(y|ed)?|granular|reese|sub-?bass|chopped|pitched|saturated|layered|textures?|resampled|modular|bitcrushed|sidechain(ed)?|processed)\b/i;
    var ENERGY = /\b(drops?|build-?ups?|builds|breakdowns?|half-?time|four-on-the-floor|rolling|driving|stomping|swung|syncopated|pounding|relentless|bouncing|bouncy|propulsive)\b/i;
    var THEME = /\b(about|against|anthem|ode to|tribute|story of|letter to|reflects?|explores?|celebrat\w*|for anyone|for everyone|dedicated|scream|meditation on|reckoning|love song|break-?up|heartbreak)\b/i;
    var PERSONAL = /\b(heritage|grew up|growing up|rooted in|roots|identity|family|inspired by|written after|wrote (it|this)|lived|personal|childhood|mother|father|parents|hometown|immigra\w*|diaspora|ancestr\w*|her own|his own|their own|my own)\b/i;
    var MADE = /\b(recorded|written in|wrote it in|made in|made at|produced in|during (the|a)|sessions?|in one take|one night|over a weekend|in a day|at home|in the studio|bedroom)\b/i;
    var CULTURE = {
      "South Asian": /\b(pakistani|pakistan|indian|india|bangladeshi|bengali|sri lankan|nepali|desi|south asian|tabla|sitar|dhol|dholak|harmonium|qawwali|bhangra|punjabi|urdu|hindi|tamil|carnatic|hindustani|sufi)\b/i,
      "African": /\b(african|afro\w*|nigerian|ghanaian|kenyan|amapiano|kora|djembe|highlife|mbira)\b/i,
      "Arabic": /\b(arabic|arab|middle eastern|egyptian|lebanese|moroccan|oud|darbuka|maqam|khaleeji|buzuq)\b/i,
      "Asian": /\b(asian|korean|japanese|chinese|taiwanese|filipino|vietnamese|thai|indonesian|k-pop|j-pop|erhu|koto|sanxian)\b/i,
      "Caribbean": /\b(caribbean|jamaican|trinidad\w*|soca|dancehall|reggae|kompa|steel drum|haitian)\b/i,
      "Celtic": /\b(celtic|irish|scottish|gaelic|bagpipes?|fiddle)\b/i,
      "Latin": /\b(latin\w*|mexican|colombian|puerto rican|dominican|cuban|brazilian|reggaeton|cumbia|salsa|bachata|spanish)\b/i,
      "Mediterranean": /\b(mediterranean|greek|italian|turkish|bouzouki)\b/i,
      "Christian": /\b(christian|gospel|worship|faith)\b/i,
      "Hindu": /\b(hindu|bhajan|devotional|kirtan)\b/i,
      "Islamic": /\b(islamic|nasheed|sufi)\b/i,
      "Judaic": /\b(jewish|klezmer|hebrew)\b/i,
      "Sikh": /\b(sikh|gurbani|kirtan|punjabi)\b/i,
      "Buddhist": /\b(buddhist|mantras?|chants?)\b/i,
      "Indigenous": /\b(indigenous|native|first nations|maori|aboriginal|powwow)\b/i,
      "Appalachian": /\b(appalachian|bluegrass|banjo|mountain)\b/i
    };
    var CRED = /(project of|member of|produced by|formerly of|frontman|frontwoman|vocalist (of|for)|singer (of|for)|co-?founder|half of|from the band|\bdebut\b|previously|[A-Z][\w.&-]*'s [A-Z]|[A-Z][\w.&-]*s' [A-Z])/;
    var TIE = /(single from|is the (new|first|second|third|fourth|fifth|latest|lead|next|debut) single|new single|debut single|is by |new track from|teams? up|collaborat\w*|joint single)/i;
    var PLAN = [
      ["video", /\b(music video|official video|video|visuali[sz]er|lyric video|premieres?)\b/i],
      ["social", /\b(short-form|shortform|tiktok|reels|shorts|content|socials?)\b/i],
      ["live", /\b(tour|tours|touring|shows|live dates|festivals?|dj sets?|headlin\w*|support slot|concerts?)\b/i],
      ["ads", /\b(ads|advertising|paid social|campaign|marketing)\b/i],
      ["press", /\b(press|interviews?|radio|podcasts?|blogs?)\b/i],
      ["follow", /\b(remix(es)?|EP|[Aa]lbum|deluxe|acoustic version)\b/],
      ["merch", /\b(merch|vinyl|bundles?)\b/i]
    ];
    var DATE = /\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?|January|February|March|April|June|July|August|September|October|November|December|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g;
    var MARKETS = [
      ["US", /\b(US|USA|United States|America)\b/], ["UK", /\b(UK|United Kingdom|Britain|England|London)\b/],
      ["Germany", /\b(Germany|Berlin)\b/], ["Canada", /\b(Canada|Toronto|Montreal|Vancouver)\b/],
      ["Australia", /\b(Australia|Sydney|Melbourne)\b/], ["France", /\b(France|Paris)\b/],
      ["Brazil", /\b(Brazil|Sao Paulo)\b/], ["Mexico", /\b(Mexico|CDMX)\b/], ["India", /\b(India|Mumbai|Delhi)\b/],
      ["Pakistan", /\b(Pakistan|Karachi|Lahore|Islamabad)\b/], ["Japan", /\b(Japan|Tokyo)\b/],
      ["Netherlands", /\b(Netherlands|Amsterdam)\b/], ["Poland", /\b(Poland|Warsaw)\b/], ["Spain", /\b(Spain|Madrid|Barcelona)\b/],
      ["Sweden", /\b(Sweden|Stockholm)\b/], ["Italy", /\b(Italy|Milan|Rome)\b/], ["Nigeria", /\b(Nigeria|Lagos)\b/],
      ["South Africa", /\b(South Africa|Johannesburg)\b/], ["Indonesia", /\b(Indonesia|Jakarta)\b/], ["Philippines", /\b(Philippines|Manila)\b/],
      ["UAE", /\b(UAE|Dubai)\b/], ["Europe", /\b(Europe|European)\b/], ["LATAM", /\b(LATAM|Latin America)\b/],
      ["Asia", /\bAsia\b/], ["Middle East", /\b(Middle East|MENA)\b/], ["Nordics", /\b(Nordics|Scandinavia)\b/],
      ["Ireland", /\b(Ireland|Dublin)\b/], ["New Zealand", /\b(New Zealand|Auckland)\b/]
    ];
    var US_HINT = /\b(United States|USA|US|California|New York|Texas|Florida|Illinois|Michigan|Georgia|Washington|Colorado|Tennessee|Nevada|Arizona|Oregon|Los Angeles|Brooklyn|Chicago|Detroit|Atlanta|Nashville|Miami|Austin|Seattle|Denver|Philadelphia|Boston)\b|,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
    var PLAYLISTS = /(playlist|Playlist|Fresh Finds|\bmint\b|Bass Arcade|Dance Rising|Electronic Rising|Housewerk|Techno Bunker|Dance Masti|\bEQUAL\b|\bRADAR\b|Brain Food|Nasty Bits|Drum (&|and) Bass Fix|Chill Tracks|Beast Mode|No Borders|New Music Friday)/;
    var COMPS = /(?:for fans of|fans of|in the vein of|sounds like|reminiscent of|recalling)\s+([^.;:!?]+)/i;
    var HYPE = /\b(best|greatest|amazing|incredible|insane|viral|smash|banger|masterpiece|game[- ]?changer|unlike anything|next big thing|must[- ]hear|hit record|guaranteed|unstoppable|legendary|epic|groundbreaking|revolutionary|mind[- ]blowing)\b/i;
    var LINKS = /(https?:\/\/|www\.|(^|\s)@\w|\.com\b|\.io\b|linktr\.ee|bit\.ly)/i;
    var COUNTS = /\b\d[\d,.]*\s*(k|m|million|thousand)?\+?\s*(followers|monthly listeners|listeners|streams|plays|views|subscribers)\b/i;
    var BEG = /\b(please (add|consider)|add (it|this|us|me) to|deserves (a spot|to be)|perfect for (your|new music friday)|get (us|me|it) on)\b/i;
    var PAID = /\b(paid (placement|playlist\w*)|playlist promotion service|pay(ing)? for (placement|playlist\w*))\b/i;
    var BANDS = [
      {min:90, key:"vstrong", name:"Very strong", tone:"pos", say:"Strong, plus long lead time and dated, checkable plans."},
      {min:75, key:"strong", name:"Strong", tone:"pos", say:"Covers everything editors officially ask for, with specifics."},
      {min:60, key:"good", name:"Good", tone:"ink", say:"Solid, but one or two things editors ask for are thin."},
      {min:40, key:"fair", name:"Fair", tone:"part", say:"Reaches some editors but gives them few reasons to stop."},
      {min:0, key:"weak", name:"Weak", tone:"neg", say:"Missing basics. Fix these before it goes in."}
    ];
    function norm(t){ return String(t||"").replace(/[‘’]/g,"'").replace(/[“”]/g,'"'); }
    function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
    function protect(text, names){
      var t = text.replace(/\bU\.S\.A?\.?/g,"US").replace(/\bU\.K\./g,"UK").replace(/\b(feat|ft|vs|Dr|St|Mr|Ms|Mrs|Jr|Sr)\./g,"$1");
      names.forEach(function(n,i){ if (n && n.indexOf(".")>-1){ t = t.split(n).join("ARTISTNAME"+i); } });
      return t;
    }
    function sentences(t){
      var out=[], re=/[.!?]+["')]?(\s+|$)/g, last=0, m;
      while ((m = re.exec(t))){
        var s = t.slice(last, m.index + m[0].length).trim();
        if (s) out.push(s);
        last = re.lastIndex;
        if (re.lastIndex >= t.length) break;
      }
      var rest = t.slice(last).trim(); if (rest) out.push(rest);
      return out;
    }
    function daysBetween(a,b){
      if (!a || !b) return null;
      var x=Date.UTC(+a.slice(0,4), +a.slice(5,7)-1, +a.slice(8,10)), y=Date.UTC(+b.slice(0,4), +b.slice(5,7)-1, +b.slice(8,10));
      if (isNaN(x) || isNaN(y)) return null;
      return Math.round((y-x)/86400000);
    }
    function leadPts(d){ if (d===null) return 0; if (d>=28) return 12; if (d>=14) return 11; if (d===13) return 10; if (d>=11) return 9; if (d===10) return 8; if (d>=8) return 7; if (d===7) return 6; return 0; }
    function homeCountry(based){
      if (!based) return null;
      if (US_HINT.test(based)) return "US";
      for (var i=0;i<MARKETS.length;i++){ if (MARKETS[i][1].test(based)) return MARKETS[i][0]; }
      return null;
    }
    function band(t){ for (var i=0;i<BANDS.length;i++){ if (t>=BANDS[i].min) return BANDS[i]; } return BANDS[BANDS.length-1]; }
    function score(p, today){
      p = p || {}; var ask = p.ask || {}, prof = p.profile || {};
      var text = norm(p.text).trim(), lower = text.toLowerCase();
      var names = norm(p.artists).split(/\s*[,×]\s*/).map(function(s){ return s.trim(); }).filter(Boolean);
      var sents = text ? sentences(protect(text, names)) : [], first = sents[0] || "";
      var crits = [];
      function ck(label, pts, got, hint, you){ return {label:label, pts:pts, got:!!got, hint:hint||label, you:!!you}; }
      function add(k, name, max, checks, note){
        var pts=0; checks.forEach(function(c){ if (c.got) pts += c.pts; });
        crits.push({k:k, name:name, max:max, pts:Math.min(max, pts), checks:checks, note:note||""});
      }
      var days = daysBetween(p.submit, p.release), lp = leadPts(days), leadChecks = [], leadNote;
      if (days === null){ leadNote = "Add the release date and the day you'll submit."; leadChecks.push(ck("Release and submit dates filled in", 8, false, "Add the release date and the day you'll submit")); }
      else {
        leadNote = days < 0 ? "The release date is before the submit date." : days + " days before release.";
        leadChecks.push(ck("Pitched " + Math.max(days,0) + " days before release", lp, lp>0, "Pitch at least 7 days before release"));
        var best = today ? leadPts(daysBetween(today, p.release)) : lp;
        if (today && p.submit > today && best > lp){ leadChecks.push(ck("Submit today instead", best-lp, false, "Submit today instead of later")); }
      }
      add("lead", "Lead time", 12, leadChecks, leadNote);
      var g = (p.genres||[]).map(function(x){ return x.toLowerCase(); });
      var hasSpecific = g.some(function(x){ return BROAD.indexOf(x) < 0; }), hasBroad = g.some(function(x){ return BROAD.indexOf(x) > -1; });
      add("genre", "Genre tags", 10, [
        ck("1 to 3 genres picked", 4, g.length>0 && g.length<=3, "Pick 1 to 3 genres"),
        ck("They honestly describe the audio", 3, g.length>0 && ask.genresHonest, "Confirm the genres honestly describe the audio", true),
        ck("At least one specific genre", 2, hasSpecific, "Add a specific genre that fits, not just a broad one"),
        ck("No broad catch-all genre", 1, g.length>0 && !hasBroad, "Swap the broad genre for a specific one, or leave that slot empty")
      ], g.length ? (p.genres||[]).join(", ") : "No genres yet.");
      var moods = (p.moods||[]).filter(function(x){ return x !== "None of these"; });
      var yesno = !!p.cover && !!p.remix && !!p.recording && !!p.instrumental && (p.instrumental === "yes" || !!String(p.language||"").trim());
      var setCS = (p.styles||[]).length>0 || (p.cultures||[]).length>0;
      add("tags", "Mood, style, culture and instrument tags", 10, [
        ck("1 or 2 moods picked", 3, moods.length>0, "Pick 1 or 2 moods"),
        ck("Instruments picked", 2, (p.instruments||[]).length>0, "Pick the instruments on the song"),
        ck("All yes/no questions answered", 2, yesno, "Answer cover, remix, recording, instrumental and lyric language"),
        ck("Style or culture set, or None picked", 1, setCS, "Set song style and music culture, or pick None"),
        ck("Every tag matches the audio", 2, !!ask.tagsMatch, "Confirm every tag matches the audio", true)
      ]);
      add("loc", "Hometown and current base", 5, [
        ck("Hometown filled in", 2, !!String(p.home||"").trim(), "Fill in your hometown"),
        ck("Current base filled in", 3, !!String(p.based||"").trim(), "Fill in where you're based")
      ]);
      var distinct = (p.instruments||[]).filter(function(x){ return GENERIC_INSTR.indexOf(x.toLowerCase()) < 0; });
      var namesDistinct = distinct.some(function(x){ var w=x.toLowerCase(); return new RegExp("\\b"+esc(w)+"\\b").test(lower) || new RegExp("\\b"+esc(w.split(" ").pop())+"\\b").test(lower); });
      var genreFirst = GENRE_WORDS.test(first) || g.some(function(x){ return x.split(/\s+/).some(function(w){ return w.length>2 && new RegExp("\\b"+esc(w)+"\\b","i").test(first); }); });
      add("sound", "Sound in the opening line", 11, [
        ck("Tempo", 2, TEMPO.test(first), "Say the tempo in the first sentence (for example 112 BPM)"),
        ck("A feel word", 2, FEEL.test(first), "Add a feel word to the first sentence (dark, euphoric, hypnotic)"),
        ck("A genre word that matches the tags", 2, genreFirst, "Use a genre word in the first sentence that matches your tags"),
        ck("The signature sound", 2, SIGNATURE.test(first), "Name the signature sound in the first sentence"),
        ck("A production detail", 1, PRODUCTION.test(first), "Add one production detail (sound design, distorted, chopped)"),
        ck("Names your most distinctive instrument tag", 1, namesDistinct, distinct.length ? "Name the " + distinct[0].toLowerCase() + " in the text so it matches the tag" : "Tag a distinctive instrument and name it in the text"),
        ck("An energy or groove word", 1, ENERGY.test(first), "Add an energy or groove word (half-time, rolling, driving)")
      ], first ? "Reads your first sentence." : "No description yet.");
      var theme = THEME.test(text), personal = PERSONAL.test(text);
      add("story", "What it's about and why it matters", 10, [
        ck("Says what the song is about", 5, theme, "Say what the song is about"),
        ck("Says why it matters to the artist", 3, personal, "Say why it matters to you (only if it's true, and OK'd by whoever it describes)"),
        ck("A detail of how or where it was made", 2, MADE.test(text), "Add one detail about how, when or where it was made")
      ]);
      var cults = (p.cultures||[]).filter(function(x){ return x !== "None of these"; });
      if (!cults.length){ add("culture", "Cultural context explained", 7, [ck("No culture tag picked, so nothing to explain", 7, true, "")]); }
      else {
        var named = cults.some(function(c){ return CULTURE[c] && CULTURE[c].test(text); });
        add("culture", "Cultural context explained", 7, [
          ck("Names the culture or its sounds", 5, named, "Name the culture or sound behind your " + cults.join(" and ") + " tag"),
          ck("Ties it to the artist's own background", 2, named && personal, "Tie it to your own background (with the person's OK)")
        ], "Checks the text explains your " + cults.join(" and ") + " tag.");
      }
      var namesIn = names.some(function(n){ return lower.indexOf(n.toLowerCase()) > -1; });
      add("who", "Who made it", 7, [
        ck("Names the artists", 4, namesIn || /produced by|feat/i.test(text), "Name the artists in the text"),
        ck("Adds a credential or background", 2, CRED.test(text), "Add a credential: another band, a label or a past release"),
        ck("Says plainly the song is theirs", 1, TIE.test(text), "Say it plainly: \"" + (p.title || "The song") + " is the new single from ...\"")
      ]);
      var acts = PLAN.filter(function(a){ return a[1].test(text); }).length, dates = (text.match(DATE)||[]).length;
      add("plan", "Release plan with dates", 10, [
        ck("Names a release activity", 3, acts>=1, "Name what's happening around release (video, content, shows, ads)"),
        ck("Names a second activity", 2, acts>=2, "Name a second release activity"),
        ck("Puts a date on one activity", 2, dates>=1, "Put a date on one activity, for example the video premiere"),
        ck("Dates a second activity", 2, dates>=2, "Put a date on a second activity"),
        ck("Three activities and two dates", 1, acts>=3 && dates>=2, "Three activities with two dates gets the last point")
      ], acts + (acts===1?" activity, ":" activities, ") + dates + (dates===1?" date found.":" dates found."));
      var homeC = homeCountry(norm(p.based)), found = [];
      MARKETS.forEach(function(m){ if (m[1].test(text) && m[0] !== homeC && found.indexOf(m[0]) < 0) found.push(m[0]); });
      var pl = PLAYLISTS.test(text.replace(/release radar( playlists?)?/ig, ""));
      add("markets", "Markets and playlist fit", 5, [
        ck("Names markets beyond " + (homeC || "home"), 2, found.length>0, "Name markets beyond " + (homeC || "your home country") + " where you already have listeners"),
        ck("Suggests a playlist you've checked", 3, pl, "Suggest one Spotify playlist you've checked that fits (a suggestion, not a demand)")
      ], found.length ? "Found: " + found.join(", ") + "." : "");
      var cm = text.match(COMPS), n = 0;
      if (cm){ n = cm[1].split(/,|\band\b|&|\/|\+/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length>1; }).length; }
      var compChecks = n===0 ? [ck("1 to 3 comparable artists", 4, false, "Add 1 to 3 comparable artists (\"for fans of ...\")")]
        : n<=3 ? [ck(n + " comparable artist" + (n===1?"":"s"), 4, true, "")]
        : [ck("Comparable artists named", 2, true, ""), ck("Trim to 3 or fewer", 2, false, "Trim the comparisons to 3 close matches")];
      add("comps", "Comparable artists", 4, compChecks);
      var longest = sents.reduce(function(m,s){ return Math.max(m, s.split(/\s+/).filter(Boolean).length); }, 0);
      add("clarity", "Clarity", 5, [
        ck("Fits in 500 characters", 2, text.length>0 && text.length<=500, text.length>500 ? "Cut " + (text.length-500) + " characters to fit in 500" : "Write the description"),
        ck("No sentence over 35 words", 1, text.length>0 && longest<=35, "Break up any sentence over 35 words"),
        ck("3 to 6 sentences", 1, sents.length>=3 && sents.length<=6, "Aim for 3 to 6 short sentences"),
        ck("Reads clearly on one pass", 1, !!ask.readsClearly, "Read it out loud once. If it's clear, tick the box", true)
      ], text.length + " characters, " + sents.length + (sents.length===1?" sentence.":" sentences."));
      add("profile", "Profile readiness", 4, [
        ck("Canvas on the track", 1, prof.canvas, "Upload a Canvas"),
        ck("Bio updated", 1, prof.bio, "Update the Spotify bio"),
        ck("Pre-save link live", 1, prof.presave, "Set up a pre-save link"),
        ck("Artist Pick planned", 1, prof.pick, "Plan the Artist Pick for release day")
      ]);
      var pen = [], hm = text.match(HYPE);
      if (hm || /!!/.test(text)) pen.push({label:"Hype" + (hm ? " (\"" + hm[0] + "\")" : " (\"!!\")"), pts:-3});
      if (LINKS.test(text)) pen.push({label:"Links or handles in the text", pts:-2});
      if (COUNTS.test(text)) pen.push({label:"Follower or stream counts used as the argument", pts:-2});
      if (BEG.test(text)) pen.push({label:"Asking or demanding to be added", pts:-3});
      if (text.length > 500) pen.push({label:"Over Spotify's 500-character limit", pts:-2});
      var paid = PAID.test(text); if (paid) pen.push({label:"Mentions paid placement", pts:-25});
      var raw = 0; crits.forEach(function(c){ raw += c.pts; }); pen.forEach(function(x){ raw += x.pts; });
      var caps = [];
      if (!text){ caps.push("A blank description caps the score at 40."); raw = Math.min(raw, 40); }
      if (days !== null && days < 7){ caps.push("Under 7 days before release caps the score at 40, and Spotify won't guarantee Release Radar."); raw = Math.min(raw, 40); }
      var total = Math.max(0, Math.min(100, raw)); if (paid) total = Math.min(total, 39);
      var moves = [];
      crits.forEach(function(c){ c.checks.forEach(function(x){ if (!x.got && x.pts>0) moves.push({pts:x.pts, hint:x.hint, you:x.you, k:c.k}); }); });
      moves.sort(function(a,b){ return b.pts - a.pts; });
      return {total:total, band:band(total), crits:crits, pen:pen, caps:caps, paid:paid, needsApproval: personal && !ask.approved, days:days, chars:text.length, moves:moves};
    }
    return {score:score, band:band, BANDS:BANDS, input:pitchInput, VERSION:METER_VERSION, NOT_YET:PITCH_NOT_YET};
  })();
  var PLATFORMS = {
    spotify: 'Spotify', apple: 'Apple Music', amazon: 'Amazon Music', deezer: 'Deezer', youtube: 'YouTube', tidal: 'TIDAL',
    soundcloud: 'SoundCloud', pandora: 'Pandora', instagram: 'Instagram', tiktok: 'TikTok', siriusxm: 'SiriusXM Canada',
    jiosaavn: 'JioSaavn', anghami: 'Anghami', audiomack: 'Audiomack'
  };
  var EVENTS = { newreleases: 'when the song shows under New Releases', tenspins: 'once the song gets 10 or more spins a week' };
  var RELEASE_STEPS = [
    { key: 'master', from: -56, at: -42, who: 'artist', platform: 'all', title: 'Master, art and metadata final, with credits spelled exactly as on past releases' },
    { key: 'altversions', from: -56, at: -42, who: 'artist', platform: 'all', title: 'Bounce the alternate versions: instrumental, sped-up, slowed, extended or club' },
    { key: 'press', from: -56, at: -42, who: 'artist', platform: 'all', title: 'Press photos and EPK ready' },
    { key: 'profiles', from: -56, at: -42, who: 'artist', platform: 'all', title: 'Every profile claimed: Spotify, Apple, Amazon, Deezer, Pandora AMP, YouTube Official Artist Channel, TikTok Artist Account' },
    { key: 'brief', from: -56, at: -42, who: 'artist', platform: 'all', alarm: true, needsOk: true, title: 'Send {d} the brief and ask if the release is a priority (Apple, YouTube, Deezer, TIDAL)' },
    { key: 'tidal', from: -56, at: -28, who: 'distributor', platform: 'tidal', title: '{D} flags the release to TIDAL' },
    { key: 'applepitchnotes', from: -28, at: -21, who: 'artist', platform: 'apple', needsOk: true, title: 'Send {d} the Apple pitch notes and ask for a pre-add link' },
    { key: 'applemapped', from: -21, at: -14, who: 'distributor', platform: 'apple', title: 'Confirm the Apple pitch is in and the release is mapped' },
    { key: 'deliver', from: -42, at: -35, who: 'artist', platform: 'all', title: 'Deliver the song to {d}. It takes about 5 days to show in Spotify for Artists' },
    { key: 'masterpitch', from: -42, at: -35, who: 'artist', platform: 'all', title: 'Write the master pitch' },
    { key: 'countdown', from: -42, at: -28, who: 'artist', platform: 'spotify', only: 'long', title: 'Countdown Page (an EP or album, from about 3,000 listeners)' },
    { key: 'spotify', from: -35, at: -28, who: 'artist', platform: 'spotify', needsOk: true, title: 'Pitch Spotify as soon as the song shows in Upcoming, aiming for 28 days out, and tell {d}' },
    { key: 'amazon', event: 'newreleases', at: 14, who: 'artist', platform: 'amazon', alarm: true, hard: true, needsOk: true, title: 'Pitch Amazon when the song shows under New Releases, with the text agreed with {d} first' },
    { key: 'amazonlabel', event: 'newreleases', at: 14, who: 'distributor', platform: 'amazon', hard: true, title: "{D}'s own Amazon label pitch" },
    { key: 'presave', from: -28, at: -21, who: 'artist', platform: 'all', title: 'Pre-save and pre-add links, plus TikTok Pre-Release' },
    { key: 'premiere', from: -28, at: -21, who: 'artist', platform: 'all', needsOk: true, title: 'Premiere outreach, and college radio if planned' },
    { key: 'canvas', from: -28, at: -14, who: 'artist', platform: 'spotify', needsOk: true, title: 'Upload the Canvas: MP4, 9:16, 720 to 1080 px tall, 3 to 8 seconds, no links. The Canvas Terms need your OK' },
    { key: 'bio', from: -28, at: -14, who: 'artist', platform: 'spotify', title: 'Update the Spotify bio' },
    { key: 'rollout', from: -21, at: -14, who: 'artist', platform: 'instagram', title: 'Start the content rollout on Instagram, TikTok and YouTube' },
    { key: 'loudspeaker', from: -28, at: -14, who: 'distributor', platform: 'youtube', title: '{D} sets the YouTube Loudspeaker pitch for release day' },
    { key: 'facts14', from: -21, at: -14, who: 'artist', platform: 'all', needsOk: true, title: 'Send {d} the new facts: the video date, press, DJ support' },
    { key: 'apple', from: -42, at: -10, who: 'distributor', platform: 'apple', alarm: true, title: 'Apple full consideration closes: confirm {d} pitched Apple Music' },
    { key: 'applelate', kind: 'deadline', ties: 'apple', from: -42, at: -7, who: 'distributor', platform: 'apple', alarm: true, hard: true, title: 'Apple late adds close' },
    { key: 'spotifylast', kind: 'deadline', ties: 'spotify', from: -35, at: -7, who: 'artist', platform: 'spotify', alarm: true, hard: true, title: 'Last day to pitch Spotify and keep Release Radar' },
    { key: 'facts7', from: -10, at: -7, who: 'artist', platform: 'all', needsOk: true, title: 'Send {d} any new facts' },
    { key: 'thisis', from: -7, at: -3, who: 'artist', platform: 'spotify', title: 'Ask for the This Is pin' },
    { key: 'pandoramsg', from: -7, at: -3, who: 'artist', platform: 'pandora', title: 'Record the Pandora Artist Audio Message and set up Promote Singles' },
    { key: 'deezer', from: -42, at: -1, who: 'distributor', platform: 'deezer', alarm: true, title: 'Deezer locks the day before release: confirm {d} pitched it' },
    { key: 'curators', from: 0, at: 0, who: 'artist', platform: 'all', needsOk: true, title: 'Start the curator campaigns: SubmitHub, Groover, Musosoup' },
    { key: 'artistpick', from: 0, at: 0, who: 'artist', platform: 'spotify', title: 'Point the Artist Pick at the new song' },
    { key: 'firstfans', from: 0, at: 0, who: 'artist', platform: 'soundcloud', title: 'Turn on SoundCloud First Fans' },
    { key: 'storyshare', from: 0, at: 0, who: 'artist', platform: 'instagram', title: 'Share the song from Spotify to Stories' },
    { key: 'applepromote', from: 0, at: 0, who: 'artist', platform: 'apple', title: 'Post the Apple Music Promote card' },
    { key: 'radarcheck', from: 0, at: 0, who: 'artist', platform: 'spotify', title: 'Check the song is in Release Radar in its Playlists view' },
    { key: 'followsave', from: 0, at: 0, who: 'artist', platform: 'all', title: 'Post with a follow and save ask' },
    { key: 'applefavorite', from: 0, at: 0, who: 'artist', platform: 'apple', title: 'Post the Become a fan favorite card on your Stories' },
    { key: 'appleinsights', from: 0, at: 0, who: 'artist', platform: 'apple', title: 'Open New Release Insights and note the first count' },
    { key: 'amazonhype', from: 0, at: 0, who: 'artist', platform: 'amazon', title: 'Post the Amazon Hype card' },
    { key: 'sync', from: 0, at: 0, who: 'artist', platform: 'all', title: 'Upload to the sync libraries' },
    { key: 'video', base: 'video', from: 0, at: 7, who: 'artist', platform: 'spotify', alarm: true, hard: true, needsOk: true, title: 'Pitch the music video to Spotify, within 7 days of the video coming out' },
    { key: 'marquee', from: 0, at: 21, who: 'artist', platform: 'spotify', alarm: true, hard: true, needsOk: true, title: 'Marquee has to start by 21 days after release' },
    { key: 'jiosaavn', from: 0, at: 14, who: 'artist', platform: 'jiosaavn', needsOk: true, title: 'Pitch JioSaavn once the song is delivered and the profile is verified' },
    { key: 'siriusxm', from: 0, at: 14, who: 'artist', platform: 'siriusxm', needsOk: true, title: 'Send the SiriusXM Canada form (it needs the ISRC)' },
    { key: 'anghami', from: 0, at: 14, who: 'artist', platform: 'anghami', only: 'live', needsOk: true, title: 'Pitch Anghami (live recordings only)' },
    { key: 'curators2', from: 1, at: 14, who: 'artist', platform: 'all', needsOk: true, title: 'Second wave of curators' },
    { key: 'botcheck', from: 1, at: 14, who: 'artist', platform: 'spotify', title: 'Bot-check every new playlist' },
    { key: 'djpool', from: 1, at: 14, who: 'artist', platform: 'all', title: 'DJ pool upload for any club edit' },
    { key: 'sourcecheck', from: 1, at: 14, who: 'artist', platform: 'spotify', title: 'Read Source of Streams and Discovered On for two weeks' },
    { key: 'showcase', from: 7, at: 14, who: 'artist', platform: 'spotify', needsOk: true, title: 'Decide on a Showcase test, only if a clip beat your normal' },
    { key: 'appleshazam', from: 1, at: 14, who: 'artist', platform: 'apple', title: 'Read the Shazam cities and use them in the next post' },
    { key: 'applerepromo', from: 1, at: 14, who: 'distributor', platform: 'apple', title: '{D} files an Apple re-promotion pitch with the new numbers' },
    { key: 'deezerclose', kind: 'deadline', ties: 'deezer', from: -42, at: 14, who: 'distributor', platform: 'deezer', alarm: true, hard: true, title: 'Deezer closes 14 days after release' },
    { key: 'audiomack', from: 0, at: 28, who: 'artist', platform: 'audiomack', needsOk: true, title: 'Email Audiomack about Trending (within about a month)' },
    { key: 'songdoctor', from: 28, at: 28, who: 'artist', platform: 'all', title: 'Song Doctor: the first 28 days against your own median' },
    { key: 'discovery', from: 30, at: 42, who: 'artist', platform: 'spotify', needsOk: true, title: 'Discovery Mode: decide once the song is 30 days old' },
    { key: 'pandorafeature', event: 'tenspins', from: 0, at: 42, who: 'artist', platform: 'pandora', title: 'Feature the song in Pandora AMP once it gets 10 or more spins a week' },
    { key: 'nextrelease', from: 14, at: 42, who: 'artist', platform: 'all', title: 'Plan the next release at least 4 weeks out' }
  ];
  function stepWords(text, dist) {
    var d = String(dist || '').trim() || 'your distributor';
    var cap = d.charAt(0).toUpperCase() + d.slice(1);
    return text.replace(/\{D\}/g, cap).replace(/\{d\}/g, d);
  }
  function planRelease(release) {
    release = release || {};
    var R = release.releaseDate, V = isDay(release.videoDate) ? release.videoDate : null, warnings = [];
    if (!isDay(R)) return { ok: false, releaseDate: null, steps: [], warnings: [{ code: 'no-date', words: 'Add the release day first.' }] };
    if (weekdayOf(R) !== 5) warnings.push({ code: 'not-friday', words: 'Releases come out on a Friday. ' + dayWords(R) + ' is not a Friday.' });
    if (V && V < R) warnings.push({ code: 'video-early', words: 'The video comes out before the song.' });
    var on = {}, list = release.platforms && release.platforms.length ? release.platforms : Object.keys(PLATFORMS);
    list.forEach(function (k) { on[String(k).toLowerCase()] = true; });
    var long = release.kind === 'ep' || release.kind === 'album';
    var steps = [];
    RELEASE_STEPS.forEach(function (s) {
      if (s.platform !== 'all' && !on[s.platform]) return;
      if (s.only === 'long' && !long) return;
      if (s.only === 'live' && !release.live) return;
      var base = s.base === 'video' ? V : R;
      if (!base) return;
      steps.push({
        key: s.key, kind: s.kind || 'step', title: stepWords(s.title, release.distributor), who: s.who, platform: s.platform,
        base: s.base === 'video' ? 'video' : 'release', offset: s.at, due: addDays(base, s.at),
        from: s.from === undefined || s.event ? null : addDays(base, s.from), event: s.event || null,
        alarm: !!s.alarm, hard: !!s.hard, needsOk: !!s.needsOk, ties: s.ties || null, when: offsetWords(s.at, s.base)
      });
    });
    steps = steps.filter(function (s) { return s.kind !== 'deadline' || steps.some(function (t) { return t.key === s.ties; }); });
    steps.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : (b.alarm - a.alarm) || (a.key < b.key ? -1 : 1); });
    return { ok: true, releaseDate: R, steps: steps, warnings: warnings };
  }
  function releaseSpacing(releases, minDays) {
    var gap = minDays || 28;
    var rs = (releases || []).filter(function (r) { return r && isDay(r.releaseDate); })
      .slice().sort(function (a, b) { return a.releaseDate < b.releaseDate ? -1 : a.releaseDate > b.releaseDate ? 1 : 0; });
    var out = [];
    for (var i = 1; i < rs.length; i++) {
      var a = rs[i - 1], b = rs[i], days = daysBetween(a.releaseDate, b.releaseDate);
      if (days >= gap) continue;
      var name = function (r) { return r.title ? String(r.title) : 'the next release'; };
      out.push({
        first: a.id !== undefined ? a.id : a.title, next: b.id !== undefined ? b.id : b.title, days: days,
        earliestPitch: a.releaseDate, leadDays: days, releaseRadar: days >= 7,
        words: name(b) + ' comes out ' + days + (days === 1 ? ' day' : ' days') + ' after ' + (a.title ? String(a.title) : 'the release before it') +
          '. Releases need 4 weeks between them: ' + name(b) + ' can only be pitched once ' + (a.title ? String(a.title) : 'that one') + ' is live, ' +
          (days >= 7 ? days + ' days out instead of 28.' : 'which is too late for Release Radar.')
      });
    }
    return out;
  }
  function spotifySlot(releases, today) {
    if (!isDay(today)) return { free: null, heldBy: null, freeOn: null, clash: [] };
    var open = (releases || []).filter(function (r) {
      return r && isDay(r.releaseDate) && isDay(r.spotifyPitchedOn) && r.spotifyPitchedOn <= today && today < r.releaseDate;
    }).sort(function (a, b) { return a.releaseDate < b.releaseDate ? -1 : 1; });
    if (!open.length) return { free: true, heldBy: null, freeOn: null, clash: [] };
    var id = function (r) { return r.id !== undefined ? r.id : r.title; };
    return { free: false, heldBy: id(open[0]), freeOn: open[0].releaseDate, clash: open.length > 1 ? open.map(id) : [] };
  }
  function num0(v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : 0; }
  function median(list) {
    var a = (list || []).filter(function (x) { return typeof x === 'number' && isFinite(x); }).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var h = Math.floor(a.length / 2);
    return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2;
  }
  function ratio(a, b) { return b > 0 && isFinite(a) ? a / b : null; }
  function commas(n) { return String(Math.round(num0(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function sourceKind(name) {
    var t = String(name || '').toLowerCase();
    if (!t || t === 'all') return 'all';
    if (/\bthis is\b/.test(t)) return 'active';
    if (/other (listener|people|user)|someone else|others' playlists|programmed/.test(t)) return 'programmed';
    if (/editorial|personali[sz]ed|algorithm|discover weekly|release radar|\bradio\b|autoplay|\bmix(es)?\b|daylist|\bdj\b|smart shuffle/.test(t)) return 'programmed';
    if (/profile|catalog|own playlist|library|queue|search|active|collection|your music/.test(t)) return 'active';
    return 'other';
  }
  function sums() { return { streams: 0, listeners: 0, saves: 0, adds: 0, rows: 0 }; }
  function addTo(s, r) {
    s.streams += num0(r.streams); s.listeners += num0(r.listeners); s.saves += num0(r.saves); s.adds += num0(r.adds); s.rows += 1;
  }
  function measures(s) {
    return {
      streams: s.streams, listeners: s.listeners, saves: s.saves, adds: s.adds,
      saveRate: ratio(s.saves, s.listeners), streamsPerListener: ratio(s.streams, s.listeners), addsPerListener: ratio(s.adds, s.listeners),
      listenersAdded: s.rows > 1
    };
  }
  var DOCTOR_MEASURES = ['saveRate', 'streamsPerListener', 'addsPerListener'];
  function against(value, med, band) {
    if (value === null || value === undefined || med === null || !(med > 0)) return { value: value === undefined ? null : value, median: med, ratio: null, call: null };
    var r = value / med;
    return { value: value, median: med, ratio: r, call: r >= 1 + band ? 'above' : r <= 1 - band ? 'below' : 'even' };
  }
  function overlaps(c, from, to) {
    var s = dayIn(c.start) || dayIn(c.date), e = dayIn(c.end) || s;
    if (!s) return false;
    return s <= to && e >= from;
  }
  var CAMPAIGN_WORDS = { discovery: 'Discovery Mode', ads: 'Ads', boost: 'A boost', editorial: 'An editorial add', tiktok: 'A TikTok spike', marquee: 'Marquee', showcase: 'Showcase' };
  function campaignWords(c) { return (c.title ? String(c.title) : (CAMPAIGN_WORDS[c.kind] || 'A campaign')); }
  function songDoctor(rows, opts) {
    opts = opts || {};
    var band = typeof opts.band === 'number' ? opts.band : 0.1;
    var songs = {}, order = [];
    (rows || []).forEach(function (r) {
      if (!r || r.song == null || String(r.song).trim() === '') return;
      var name = String(r.song).trim(), s = songs[name];
      if (!s) { s = songs[name] = { song: name, releaseDate: null, rows: [] }; order.push(name); }
      if (!s.releaseDate && isDay(r.releaseDate)) s.releaseDate = r.releaseDate;
      s.rows.push(r);
    });
    var twelve = {};
    if (opts.streams12m) {
      if (Object.prototype.toString.call(opts.streams12m) === '[object Array]') opts.streams12m.forEach(function (x) { if (x && x.song != null) twelve[String(x.song).trim()] = num0(x.streams); });
      else Object.keys(opts.streams12m).forEach(function (k) { twelve[String(k).trim()] = num0(opts.streams12m[k]); });
    }
    var out = order.map(function (name) {
      var s = songs[name], R = s.releaseDate, end = R ? addDays(R, 27) : null;
      var per = {}, whole = null;
      s.rows.forEach(function (r) {
        var d = dayIn(r.date);
        var inside = r.first28 === true || (R && d && d >= R && d <= end);
        if (!inside) return;
        var src = r.source == null || String(r.source).trim() === '' ? 'all' : String(r.source).trim();
        if (src.toLowerCase() === 'all') { whole = whole || sums(); addTo(whole, r); return; }
        per[src] = per[src] || sums(); addTo(per[src], r);
      });
      var bySource = {}, act = 0, prog = 0, total = sums();
      Object.keys(per).forEach(function (src) {
        bySource[src] = measures(per[src]);
        bySource[src].kind = sourceKind(src);
        if (bySource[src].kind === 'active') act += per[src].streams;
        if (bySource[src].kind === 'programmed') prog += per[src].streams;
        if (!whole) { total.streams += per[src].streams; total.listeners += per[src].listeners; total.saves += per[src].saves; total.adds += per[src].adds; total.rows += per[src].rows; }
      });
      if (whole) total = whole;
      var confounders = R ? (opts.campaigns || []).filter(function (c) {
        return c && (c.song == null || String(c.song).trim() === '' || String(c.song).trim() === name) && overlaps(c, R, end);
      }).map(function (c) { return { kind: c.kind || 'other', start: dayIn(c.start) || dayIn(c.date), end: dayIn(c.end) || dayIn(c.start) || dayIn(c.date), words: campaignWords(c) + ' ran in its first 28 days.' }; }) : [];
      var t12 = Object.prototype.hasOwnProperty.call(twelve, name) ? twelve[name] : null;
      return {
        song: name, releaseDate: R, due: R ? addDays(R, 28) : null,
        partial: !!(opts.today && R && daysBetween(R, opts.today) < 28),
        total: measures(total), active: act, programmed: prog, activeShare: ratio(act, act + prog),
        bySource: bySource, confounders: confounders, streams12m: t12, under1000: t12 !== null && t12 < 1000
      };
    });
    var pool = out.filter(function (s) { return s.releaseDate && !s.partial && !(opts.cleanMedian && s.confounders.length); });
    var sources = {};
    out.forEach(function (s) { Object.keys(s.bySource).forEach(function (k) { sources[k] = true; }); });
    var medians = { all: {} };
    DOCTOR_MEASURES.forEach(function (m) { medians.all[m] = median(pool.map(function (s) { return s.total[m]; })); });
    medians.all.activeShare = median(pool.map(function (s) { return s.activeShare; }));
    Object.keys(sources).forEach(function (src) {
      medians[src] = {};
      DOCTOR_MEASURES.forEach(function (m) {
        medians[src][m] = median(pool.map(function (s) { return s.bySource[src] ? s.bySource[src][m] : null; }));
      });
    });
    out.forEach(function (s) {
      s.vs = { all: {} };
      DOCTOR_MEASURES.forEach(function (m) { s.vs.all[m] = against(s.total[m], medians.all[m], band); });
      s.vs.all.activeShare = against(s.activeShare, medians.all.activeShare, band);
      Object.keys(s.bySource).forEach(function (src) {
        s.vs[src] = {};
        DOCTOR_MEASURES.forEach(function (m) { s.vs[src][m] = against(s.bySource[src][m], medians[src][m], band); });
      });
    });
    out.sort(function (a, b) { return (b.releaseDate || '') < (a.releaseDate || '') ? -1 : (b.releaseDate || '') > (a.releaseDate || '') ? 1 : 0; });
    return { songs: out, medians: medians, sources: Object.keys(sources).sort(), under1000: out.filter(function (s) { return s.under1000; }).map(function (s) { return s.song; }) };
  }
  function under1000(list) {
    return (list || []).filter(function (x) { return x && x.song != null && num0(x.streams) < 1000; })
      .map(function (x) { return { song: String(x.song).trim(), streams: num0(x.streams), short: 1000 - num0(x.streams) }; })
      .sort(function (a, b) { return a.streams - b.streams; });
  }
  var PITCHED_ON = ['spotify', 'apple', 'amazon', 'deezer', 'youtube', 'tidal'];
  function streamCheckup(release, ctx) {
    release = release || {}; ctx = ctx || {};
    var R = release.releaseDate, checks = [];
    var pitches = release.pitches || [];
    var sp = pitches.filter(function (p) { return p && p.platform === 'spotify' && isDay(p.sentOn); })
      .sort(function (a, b) { return a.sentOn < b.sentOn ? -1 : 1; })[0];
    var lead = sp && isDay(R) ? daysBetween(sp.sentOn, R) : null;
    checks.push({ key: 'lead', ok: lead !== null && lead >= 7,
      words: lead === null ? 'No Spotify pitch is logged, so the song had no Release Radar slot.'
        : lead >= 28 ? 'Pitched to Spotify ' + lead + ' days out.'
        : lead >= 7 ? 'Pitched to Spotify ' + lead + ' days out. 28 days gives editors the most time.'
        : 'Pitched to Spotify ' + Math.max(lead, 0) + ' days out, under 7, so no Release Radar.' });
    var on = {}, list = release.platforms && release.platforms.length ? release.platforms : Object.keys(PLATFORMS);
    list.forEach(function (k) { on[String(k).toLowerCase()] = true; });
    var done = {};
    pitches.forEach(function (p) { if (p && p.platform) done[String(p.platform).toLowerCase()] = true; });
    var missing = PITCHED_ON.filter(function (k) { return on[k] && !done[k]; });
    checks.push({ key: 'everywhere', ok: !missing.length,
      words: missing.length ? 'Not pitched on ' + missing.map(function (k) { return PLATFORMS[k]; }).join(', ') + '.' : 'Pitched on every platform it is on.' });
    var prof = release.profile || {}, PROF = [['canvas', 'Canvas'], ['bio', 'bio'], ['pick', 'Artist Pick'], ['presave', 'pre-save']];
    var gaps = PROF.filter(function (x) { return !prof[x[0]]; }).map(function (x) { return x[1]; });
    checks.push({ key: 'profile', ok: !gaps.length, words: gaps.length ? 'Profile not ready: no ' + gaps.join(', no ') + '.' : 'Canvas, bio, Artist Pick and pre-save all set.' });
    var clash = isDay(R) ? releaseSpacing(ctx.releases || []).filter(function (x) {
      var mine = release.id !== undefined ? release.id : release.title;
      return x.first === mine || x.next === mine;
    }) : [];
    checks.push({ key: 'spacing', ok: !clash.length, words: clash.length ? clash[0].words : 'At least 4 weeks from the releases around it.' });
    checks.push({ key: 'altversions', ok: !!release.altVersions, words: release.altVersions ? 'Alternate versions are out.' : 'No alternate versions (instrumental, sped-up, slowed, extended or club) yet.' });
    var end = isDay(R) ? addDays(R, 27) : null;
    var chances = isDay(R) ? (ctx.chances || []).filter(function (c) { return c && isDay(c.date) && c.date >= R && c.date <= end; }) : [];
    chances.forEach(function (c, i) { checks.push({ key: 'chance' + i, ok: !!c.taken, words: (c.taken ? 'Took ' : 'Missed ') + String(c.words || 'a dated chance') + ' (' + dayWords(c.date) + ').' }); });
    return { checks: checks, passed: checks.filter(function (c) { return c.ok; }).length, of: checks.length };
  }
  var SOCIAL_LISTS = { instagram: true, youtube: true, tiktok: true, facebook: true };
  var TEST_GAP = 5;
  var CITY_ALIASES = {
    'nyc': 'new york', 'new york city': 'new york', 'la': 'los angeles', 'sf': 'san francisco', 'dc': 'washington',
    'washington dc': 'washington', 'frankfurt am main': 'frankfurt', 'koln': 'cologne', 'munchen': 'munich', 'wien': 'vienna',
    'sao paulo city': 'sao paulo', 'mexico city cdmx': 'mexico city', 'cdmx': 'mexico city', 'ciudad de mexico': 'mexico city'
  };
  function plain(s) { var t = String(s); return typeof t.normalize === 'function' ? t.normalize('NFD').replace(/[̀-ͯ]/g, '') : t; }
  function cityKey(name, opts) {
    var t = plain(String(name == null ? '' : name)).toLowerCase().trim();
    t = t.replace(/\s*\([^)]*\)\s*$/, '').split(',')[0];
    t = t.replace(/['’.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    t = t.replace(/^st /, 'saint ').replace(/^ste /, 'sainte ').replace(/^ft /, 'fort ').replace(/^mt /, 'mount ');
    var extra = opts && opts.aliases;
    if (extra) { var k = cityKey(t), hit = null; Object.keys(extra).forEach(function (a) { if (cityKey(a) === k || a.toLowerCase() === t) hit = extra[a]; }); if (hit) return cityKey(hit); }
    return CITY_ALIASES[t] || t;
  }
  function cityLabel(name) { return String(name).replace(/\s*\([^)]*\)\s*$/, '').split(',')[0].trim(); }
  function cityTable(lists, opts) {
    opts = opts || {}; lists = lists || {};
    var top = opts.top || 10, gap = typeof opts.testGap === 'number' ? opts.testGap : TEST_GAP, coreMin = opts.coreMin || 3;
    var rows = {}, order = [], used = [];
    Object.keys(lists).forEach(function (src) {
      var list = lists[src];
      if (!list || !list.length) return;
      var name = String(src).toLowerCase(), rank = 0;
      used.push(name);
      list.forEach(function (item) {
        var city = item && typeof item === 'object' ? item.city : item;
        if (city == null || String(city).trim() === '' || rank >= top) return;
        var key = cityKey(city, opts);
        if (!key) return;
        var row = rows[key];
        if (!row) { row = rows[key] = { key: key, name: cityLabel(city), lists: [], ranks: {}, counts: {} }; order.push(key); }
        if (row.ranks[name]) return;
        rank += 1;
        row.ranks[name] = rank;
        row.lists.push(name);
        if (item && typeof item === 'object' && item.count != null && isFinite(+item.count)) row.counts[name] = +item.count;
      });
    });
    var out = order.map(function (k) {
      var r = rows[k], tags = [];
      r.count = r.lists.length;
      if (r.count >= coreMin) tags.push('core');
      if (r.lists.every(function (l) { return SOCIAL_LISTS[l]; })) tags.push('socialOnly');
      if (r.count === 1 && r.lists[0] === 'spotify') tags.push('spotifyOnly');
      if (r.ranks.shazam && ((r.ranks.spotify || top + 1) - r.ranks.shazam) >= gap) tags.push('test');
      r.tags = tags;
      r.group = tags.indexOf('core') >= 0 ? 'core' : tags.indexOf('test') >= 0 ? 'test' : tags.indexOf('socialOnly') >= 0 ? 'socialOnly'
        : tags.indexOf('spotifyOnly') >= 0 ? 'spotifyOnly' : 'other';
      r.best = Math.min.apply(null, r.lists.map(function (l) { return r.ranks[l]; }));
      return r;
    });
    out.sort(function (a, b) { return (b.count - a.count) || (a.best - b.best) || (a.name < b.name ? -1 : 1); });
    var pick = function (tag) { return out.filter(function (r) { return r.tags.indexOf(tag) >= 0; }).map(function (r) { return r.name; }); };
    return {
      rows: out, core: pick('core'), socialOnly: pick('socialOnly'), spotifyOnly: pick('spotifyOnly'), test: pick('test'), lists: used,
      rules: { top: top, coreMin: coreMin, testGap: gap }
    };
  }
  var POST_RATES = ['likes', 'comments', 'sends', 'saves', 'visits', 'follows', 'linkTaps'];
  var POST_RESULT_FIELDS = {
    all: ['reach', 'nonFollowers', 'likes', 'comments', 'sends', 'saves', 'visits', 'follows', 'linkTaps'],
    reel: ['skipRate', 'avgWatchSec'],
    story: ['replies', 'stickerTaps', 'exits']
  };
  var POST_CHECKLIST = [
    { key: 'collab', words: 'Every Collab invite accepted' },
    { key: 'replies', words: 'Reply to comments in the first hour, in full sentences, with a follow-up question where it fits' },
    { key: 'story', words: 'Share it to your own Story in the first hour: a line of context, a poll or slider, and one link sticker after the first frame (never a bare reshare). Save the frame to the releases Highlight' },
    { key: 'askshare', words: 'Ask the people in the post to share it to their Stories (no "share to win")' },
    { key: 'biolink', words: 'The bio link points to the song the caption names' },
    { key: 'pin', words: 'Pin it if it is the current release' },
    { key: 'noboost', words: 'Hold off boosting for 24 hours' },
    { key: 'results', words: 'Log the results after 24 hours and 7 days' }
  ];
  var CHECKPOINTS = [['24h', 1, 'the 24-hour'], ['7d', 7, 'the 7-day']];
  var FORMAT_WORDS = { photo: 'photo or carousel', carousel: 'carousel', reel: 'Reel', story: 'Story' };
  function snapWeek(s) { var d = dayIn(s.week) || dayIn(s.date); return d ? mondayOf(d) : null; }
  function snapHasNumber(s) {
    var m = s && s.metrics;
    return !!m && typeof m === 'object' && Object.keys(m).some(function (k) { return typeof m[k] === 'number' && isFinite(m[k]); });
  }
  function movedOf(snapshots, week, band) {
    var series = {};
    (snapshots || []).forEach(function (s) {
      var w = s && snapWeek(s);
      if (!w || !s.metrics || w > week) return;
      Object.keys(s.metrics).forEach(function (m) {
        var v = s.metrics[m];
        if (typeof v !== 'number' || !isFinite(v)) return;
        var id = (s.kind || 'song') + '\x01' + String(s.key == null ? '' : s.key) + '\x01' + m;
        series[id] = series[id] || { kind: s.kind || 'song', key: s.key == null ? '' : String(s.key), metric: m, at: {} };
        series[id].at[w] = v;
      });
    });
    var out = [];
    Object.keys(series).forEach(function (id) {
      var x = series[id], now = x.at[week], before = x.at[addDays(week, -7)];
      if (typeof now !== 'number' || typeof before !== 'number') return;
      var weeks = Object.keys(x.at).sort(), changes = [];
      for (var i = 1; i < weeks.length; i++) {
        if (weeks[i] >= week) break;
        if (daysBetween(weeks[i - 1], weeks[i]) === 7) changes.push(x.at[weeks[i]] - x.at[weeks[i - 1]]);
      }
      var change = now - before, med = changes.length >= 2 ? median(changes) : null;
      var call = med === null ? null : change > med + Math.abs(med) * band ? 'above' : change < med - Math.abs(med) * band ? 'below' : 'even';
      out.push({ kind: x.kind, key: x.key, metric: x.metric, now: now, before: before, change: change, pct: before ? change / before : null, median: med, call: call, weeks: weeks.length });
    });
    out.sort(function (a, b) {
      var pa = a.pct === null ? (a.change ? Infinity : 0) : Math.abs(a.pct), pb = b.pct === null ? (b.change ? Infinity : 0) : Math.abs(b.pct);
      return (pb - pa) || (Math.abs(b.change) - Math.abs(a.change)) || (a.key < b.key ? -1 : 1);
    });
    return out;
  }
  function perReach(res) {
    var reach = num0(res.reach), o = {};
    POST_RATES.forEach(function (k) { o[k] = reach > 0 && res[k] != null && isFinite(+res[k]) ? (+res[k]) / reach : null; });
    return o;
  }
  function postDay(p) { return dayIn(p.postedAt); }
  function resultAt(p, at) { return (p.results || []).filter(function (r) { return r && r.at === at; })[0] || null; }
  function resultBoosted(p, res) { return res && typeof res.boosted === 'boolean' ? res.boosted : !!(p && p.boosted); }
  function postMovesOf(posts, from, to, band) {
    var out = [];
    (posts || []).forEach(function (p) {
      CHECKPOINTS.forEach(function (cp) {
        var res = resultAt(p, cp[0]), day = postDay(p);
        if (!res || !day) return;
        var logged = dayIn(res.loggedOn) || addDays(day, cp[1]);
        if (logged < from || logged > to) return;
        var boosted = resultBoosted(p, res);
        var peers = (posts || []).filter(function (q) {
          var r = q !== p && (q.format || '') === (p.format || '') ? resultAt(q, cp[0]) : null;
          return !!r && resultBoosted(q, r) === boosted;
        });
        var mine = perReach(res), rates = {};
        POST_RATES.forEach(function (k) {
          rates[k] = against(mine[k], median(peers.map(function (q) { return perReach(resultAt(q, cp[0]))[k]; })), band);
        });
        out.push({ post: p.id !== undefined ? p.id : p.title, title: p.title || '', format: p.format || '', boosted: boosted, at: cp[0],
          reach: num0(res.reach), nonFollowers: res.nonFollowers == null ? null : +res.nonFollowers, rates: rates, peers: peers.length });
      });
    });
    return out;
  }
  function whyOf(input, from, to) {
    var out = [];
    (input.releases || []).forEach(function (r) {
      var R = r && r.releaseDate;
      if (!isDay(R)) return;
      var name = r.title ? String(r.title) : 'A release';
      if (R >= from && R <= to) out.push({ kind: 'release', date: R, ref: r.id, words: name + ' came out ' + dayWords(R) + '.' });
      else if (R < from && daysBetween(R, to) < 28) out.push({ kind: 'radar', date: R, ref: r.id, words: name + ' is still in its 28 days on Release Radar (day ' + (daysBetween(R, to) + 1) + ').' });
      if (isDay(r.videoDate) && r.videoDate >= from && r.videoDate <= to) out.push({ kind: 'video', date: r.videoDate, ref: r.id, words: 'The video for ' + name + ' came out ' + dayWords(r.videoDate) + '.' });
    });
    (input.posts || []).forEach(function (p) {
      var d = p && postDay(p);
      if (!d || d < from || d > to) return;
      out.push({ kind: 'post', date: d, ref: p.id, words: 'Posted ' + (p.title ? String(p.title) : 'a ' + (FORMAT_WORDS[p.format] || 'post')) + ' on ' + dayWords(d) + (p.boosted ? ', boosted' : '') + (typeof p.score === 'number' ? ' (scored ' + p.score + ')' : '') + '.' });
    });
    (input.campaigns || []).forEach(function (c) {
      if (!c || !overlaps(c, from, to)) return;
      var s = dayIn(c.start) || dayIn(c.date);
      out.push({ kind: 'campaign', date: s < from ? from : s, ref: c.id, words: campaignWords(c) + (c.song ? ' for ' + String(c.song) : '') + ' ran this week.' });
    });
    (input.playlistAdds || []).forEach(function (a) {
      var d = a && dayIn(a.date);
      if (!d || d < from || d > to) return;
      out.push({ kind: 'playlist', date: d, ref: a.id, words: (a.song ? String(a.song) + ' was added to ' : 'Added to ') + (a.playlist ? String(a.playlist) : 'a playlist') + (num0(a.followers) > 0 ? ' (' + commas(a.followers) + ' followers)' : '') + '.' });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }
  function isDone(s) { return s.status === 'done' || s.status === 'skipped' || s.done === true; }
  function openItems(input, today) {
    var items = [];
    (input.releases || []).forEach(function (r) {
      if (!r) return;
      var saved = !!(r.steps && r.steps.length);
      if (!saved && isDay(r.releaseDate) && daysBetween(addDays(r.releaseDate, 42), today) > 14) return;
      var steps = saved ? r.steps : planRelease(r).steps;
      var name = r.title ? String(r.title) : '';
      var byKey = {};
      steps.forEach(function (s) { if (s.key) byKey[s.key] = s; });
      var tiedPast = {};
      steps.forEach(function (s) {
        if (s.kind === 'deadline' && s.ties && s.hard && isDay(s.due) && s.due < today && !isDone(s)) tiedPast[s.ties] = s.due;
      });
      steps.forEach(function (s) {
        if (isDone(s) || !isDay(s.due)) return;
        if (s.kind === 'deadline' && s.ties && byKey[s.ties] && isDone(byKey[s.ties])) return;
        var missedOn = s.hard && s.due < today ? s.due : tiedPast[s.key] || null;
        items.push({ kind: s.kind === 'deadline' ? 'deadline' : 'step', release: r.id !== undefined ? r.id : name, releaseTitle: name, key: s.key || null, ties: s.ties || null,
          title: s.title, due: s.due, from: isDay(s.from) ? s.from : null, event: s.event || null, eventSeen: !!s.eventSeen,
          alarm: !!s.alarm, hard: !!s.hard, needsOk: !!s.needsOk, who: s.who || 'artist', platform: s.platform || 'all', missed: !!missedOn, missedOn: missedOn });
      });
      if (isDay(r.releaseDate) && !steps.some(function (s) { return s.key === 'songdoctor'; }) && !r.songDoctorDone) {
        items.push({ kind: 'step', release: r.id !== undefined ? r.id : name, releaseTitle: name, key: 'songdoctor', title: 'Song Doctor: the first 28 days against your own median',
          due: addDays(r.releaseDate, 28), from: addDays(r.releaseDate, 28), event: null, eventSeen: false, alarm: false, hard: false, needsOk: false, who: 'artist', platform: 'all', missed: false });
      }
    });
    (input.posts || []).forEach(function (p) {
      var d = p && postDay(p);
      if (!d) return;
      CHECKPOINTS.forEach(function (cp) {
        if (resultAt(p, cp[0])) return;
        var due = addDays(d, cp[1]);
        if (daysBetween(due, today) > 14) return;
        items.push({ kind: 'post', release: null, releaseTitle: '', post: p.id !== undefined ? p.id : p.title, key: 'results' + cp[0],
          title: 'Log ' + cp[2] + ' results for ' + (p.title ? String(p.title) : 'the ' + (FORMAT_WORDS[p.format] || 'post') + ' from ' + dayWords(d)),
          due: due, from: due, event: null, eventSeen: false, alarm: false, hard: false, needsOk: false, who: 'artist', platform: 'instagram', missed: false });
      });
    });
    items.forEach(function (it) { it.daysLeft = daysBetween(today, it.due); it.dueWords = dueWords(it.daysLeft); });
    items.forEach(function (d) {
      if (d.kind !== 'deadline' || !d.ties || d.missed) return;
      var step = items.filter(function (it) { return it.kind === 'step' && it.key === d.ties && it.release === d.release && !it.missed; })[0];
      if (step) { d.tiedOpen = true; step.closes = d.due; step.closesLeft = d.daysLeft; step.closesWords = d.title; }
    });
    return items;
  }
  function urgency(it) {
    var eff = it.daysLeft, hot = !!(it.hard || it.alarm);
    if (it.closes && eff < 0 && typeof it.closesLeft === 'number') { eff = it.closesLeft; hot = true; }
    var tier = hot && eff <= 7 ? 0 : eff < 0 ? 1 : 2;
    return tier * 100000 + eff;
  }
  function byUrgency(a, b) {
    return (urgency(a) - urgency(b)) || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || ((b.hard ? 1 : 0) - (a.hard ? 1 : 0)) ||
      ((b.alarm ? 1 : 0) - (a.alarm ? 1 : 0)) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  }
  function weekly(input, opts) {
    input = input || {}; opts = opts || {};
    var today = isDay(input.today) ? input.today : null;
    if (!today) return { ok: false, words: 'No day given.' };
    var band = typeof opts.band === 'number' ? opts.band : 0.1, howMany = opts.next || 5, ahead = opts.days || 14;
    var latest = null;
    (input.snapshots || []).forEach(function (s) {
      var w = s && snapHasNumber(s) && snapWeek(s);
      if (w && w <= today && (!latest || w > latest)) latest = w;
    });
    var week = latest || addDays(mondayOf(today), -7), weekEnd = addDays(week, 6);
    var items = openItems(input, today);
    var live = items.filter(function (it) { return !it.missed; });
    var waiting = live.filter(function (it) { return it.event && !it.eventSeen; });
    var now = live.filter(function (it) { return !it.tiedOpen && !(it.event && !it.eventSeen) && (!it.from || it.from <= today); }).sort(byUrgency);
    return {
      ok: true, today: today, week: week, weekEnd: weekEnd,
      moved: movedOf(input.snapshots, week, band),
      posts: postMovesOf(input.posts, week, weekEnd, band),
      why: whyOf(input, week, weekEnd),
      next: now.slice(0, howMany),
      deadlines: live.filter(function (it) { return it.daysLeft >= 0 && it.daysLeft <= ahead; }).sort(function (a, b) {
        return (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || ((b.hard ? 1 : 0) - (a.hard ? 1 : 0)) || ((b.alarm ? 1 : 0) - (a.alarm ? 1 : 0)) || (a.title < b.title ? -1 : 1);
      }),
      missed: items.filter(function (it) { return it.missed && daysBetween(today, it.missedOn) >= -ahead; })
        .sort(function (a, b) { return a.missedOn < b.missedOn ? 1 : a.missedOn > b.missedOn ? -1 : (a.due < b.due ? 1 : -1); }),
      waiting: waiting.sort(byUrgency)
    };
  }
  var CSV_FIELDS = {
    song: ['song', 'track', 'song name', 'track name', 'song title', 'track title', 'title', 'name'],
    artist: ['artist', 'artists', 'artist name'],
    releaseDate: ['release date', 'released', 'release day'],
    date: ['date', 'day', 'week', 'week of', 'week start', 'week ending', 'period', 'month', 'date added'],
    source: ['source', 'source of streams', 'stream source', 'source type', 'source name'],
    streams: ['streams', 'plays', 'total streams', 'stream count', 'play count'],
    listeners: ['listeners', 'unique listeners', 'monthly listeners', 'audience'],
    saves: ['saves', 'saved', 'library saves', 'adds to library', 'library adds'],
    adds: ['playlist adds', 'added to playlists', 'adds to playlists', 'playlist additions'],
    followers: ['followers', 'follows', 'playlist followers'],
    playlist: ['playlist', 'playlist name'],
    curator: ['curator', 'made by', 'owner', 'playlist owner'],
    city: ['city', 'town', 'metro', 'top cities'],
    country: ['country', 'territory', 'country or region', 'region'],
    shazams: ['shazams', 'shazam', 'shazam count', 'shazam counts'],
    rank: ['rank', 'position', 'no']
  };
  var CSV_NUMBERS = { streams: true, listeners: true, saves: true, adds: true, followers: true, shazams: true, rank: true };
  var CSV_DAYS = { date: true, releaseDate: true };
  var CSV_KINDS = {
    playlists: { needs: ['playlist'], any: ['streams', 'listeners', 'followers', 'date'] },
    cities: { needs: ['city'], any: ['listeners', 'streams', 'shazams', 'rank'] },
    songs: { needs: ['song'], any: ['streams', 'listeners', 'saves'] },
    timeline: { needs: ['date'], any: ['listeners', 'streams', 'followers', 'saves'] }
  };
  function headWords(cell) {
    return String(cell == null ? '' : cell).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function csvColumns(header, map) {
    var cols = {}, taken = {}, heads = (header || []).map(headWords);
    if (map) Object.keys(map).forEach(function (f) {
      var i = map[f];
      if (CSV_FIELDS[f] && typeof i === 'number' && i >= 0 && i < heads.length && !taken[i]) { cols[f] = i; taken[i] = true; }
    });
    var pairs = [];
    Object.keys(CSV_FIELDS).forEach(function (f) { CSV_FIELDS[f].forEach(function (w) { pairs.push([f, w]); }); });
    heads.forEach(function (h, i) {
      if (taken[i] || !h) return;
      for (var j = 0; j < pairs.length; j++) {
        if (cols[pairs[j][0]] === undefined && pairs[j][1] === h) { cols[pairs[j][0]] = i; taken[i] = true; return; }
      }
    });
    pairs.sort(function (a, b) { return b[1].length - a[1].length; });
    heads.forEach(function (h, i) {
      if (taken[i] || !h) return;
      for (var j = 0; j < pairs.length; j++) {
        var f = pairs[j][0], w = pairs[j][1];
        if (cols[f] !== undefined || w.length < 3) continue;
        if ((' ' + h + ' ').indexOf(' ' + w + ' ') >= 0) { cols[f] = i; taken[i] = true; return; }
      }
    });
    var unknown = [];
    (header || []).forEach(function (h, i) { if (!taken[i] && String(h == null ? '' : h).trim() !== '') unknown.push({ index: i, header: String(h).trim() }); });
    return { columns: cols, unknown: unknown };
  }
  function csvNumber(v) {
    if (v == null) return null;
    var t = String(v).trim();
    if (!t || t === '-' || /^n\/?a$/i.test(t)) return null;
    var pct = /%$/.test(t);
    t = t.replace(/[%\s,$ ]/g, '');
    var m = /^(-?\d+(?:\.\d+)?)([kKmM])?$/.exec(t);
    if (!m) return null;
    var n = parseFloat(m[1]) * (m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1);
    return pct ? n / 100 : n;
  }
  var CSV_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function csvDay(v) {
    var t = String(v == null ? '' : v).trim(), m, y, mo, d;
    if ((m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(t))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(t))) { mo = +m[1]; d = +m[2]; y = +m[3] < 100 ? 2000 + (+m[3]) : +m[3]; }
    else if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(t))) { mo = CSV_MONTHS[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; y = +m[3]; }
    else if ((m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(t))) { d = +m[1]; mo = CSV_MONTHS[m[2].slice(0, 3).toLowerCase()]; y = +m[3]; }
    else return null;
    var s = y + '-' + pad2(mo || 0) + '-' + pad2(d);
    return isDay(s) ? s : null;
  }
  function csvGrid(text) {
    var G = root.GRS, C = root.GR;
    if (G && typeof G.parseCSV === 'function') return G.parseCSV(text);
    if (C && typeof C.parseCsv === 'function') return C.parseCsv(text).map(function (r) { return r.map(function (c) { return String(c).trim(); }); });
    return null;
  }
  function guessKind(cols) {
    var kinds = Object.keys(CSV_KINDS);
    for (var i = 0; i < kinds.length; i++) {
      var k = CSV_KINDS[kinds[i]];
      if (k.needs.every(function (f) { return cols[f] !== undefined; }) && k.any.some(function (f) { return cols[f] !== undefined; })) return kinds[i];
    }
    return 'unknown';
  }
  function readCsv(text, opts) {
    opts = opts || {};
    var grid = csvGrid(text);
    if (!grid) return { ok: false, kind: 'unknown', rows: [], words: 'The file reader is not loaded.' };
    grid = grid.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    if (!grid.length) return { ok: false, kind: 'unknown', header: [], headerRow: -1, columns: {}, unknown: [], missing: [], rows: [], skipped: 0, words: 'The file is empty.' };
    var at = 0, best = -1;
    for (var r = 0; r < Math.min(grid.length, 10); r++) {
      var hits = Object.keys(csvColumns(grid[r]).columns).length;
      if (hits > best) { best = hits; at = r; }
      if (hits >= 2) break;
    }
    var header = grid[at], found = csvColumns(header, opts.map), cols = found.columns;
    var kind = opts.kind && CSV_KINDS[opts.kind] ? opts.kind : guessKind(cols);
    var missing = kind === 'unknown' ? [] : CSV_KINDS[kind].needs.filter(function (f) { return cols[f] === undefined; })
      .concat(CSV_KINDS[kind].any.some(function (f) { return cols[f] !== undefined; }) ? [] : [CSV_KINDS[kind].any[0]]);
    var rows = [], skipped = 0;
    grid.slice(at + 1).forEach(function (line) {
      var o = {}, any = false;
      Object.keys(cols).forEach(function (f) {
        var raw = line[cols[f]], v;
        if (CSV_NUMBERS[f]) v = csvNumber(raw);
        else if (CSV_DAYS[f]) v = csvDay(raw);
        else v = raw == null ? '' : String(raw).trim();
        if (v !== null && v !== '') any = true;
        o[f] = v;
      });
      if (any) rows.push(o); else skipped += 1;
    });
    return {
      ok: kind !== 'unknown' && !missing.length, kind: kind, header: header, headerRow: at, columns: cols, unknown: found.unknown,
      missing: missing, rows: rows, skipped: skipped,
      words: kind === 'unknown' ? 'Say which column is which: the file did not match a Spotify or Apple export it knows.'
        : missing.length ? 'Say which column holds ' + missing.join(' and ') + '.' : rows.length + (rows.length === 1 ? ' row read.' : ' rows read.')
    };
  }
  function csvSnapshots(read, opts) {
    opts = opts || {};
    var week = isDay(opts.week) ? mondayOf(opts.week) : null;
    if (!read || !read.rows || !week) return [];
    var keyField = read.kind === 'cities' ? 'city' : read.kind === 'playlists' ? 'playlist' : 'song';
    var kind = read.kind === 'cities' ? 'city' : read.kind === 'playlists' ? 'playlist' : 'song';
    var out = [];
    read.rows.forEach(function (r) {
      var key = r[keyField];
      if (key == null || String(key).trim() === '') return;
      var metrics = {}, any = false;
      Object.keys(CSV_NUMBERS).forEach(function (f) { if (f !== 'rank' && typeof r[f] === 'number') { metrics[f] = r[f]; any = true; } });
      if (typeof r.rank === 'number') metrics.rank = r.rank;
      if (!any && metrics.rank === undefined) return;
      out.push({ kind: kind, key: String(key).trim() + (kind === 'city' && r.country ? ', ' + r.country : ''), week: week, platform: opts.platform || null, metrics: metrics });
    });
    return out;
  }
  var PLAYBOOK_VERSION = 'playbook-v1';
  var PB_RULES = {
    instagram: {
      reel: [
        { id: 'hook', label: 'Hook in the first 2 seconds', max: 20, kind: 'J', full: 'It opens on the best part.',
          half: 'The good part comes a second or two in.', none: 'It starts slow.', fix: 'Open on the drop, a face or a striking moment. No logo, fade or hello first.' },
        { id: 'change', label: 'Keeps changing after 3 seconds', max: 10, kind: 'J', full: 'It keeps moving: a new angle, person or place.',
          half: 'It sits on one shot for a while.', none: 'Nothing changes after the start.', fix: 'Change the angle, the person or the place every few seconds, or make it loop.' },
        { id: 'send', label: 'Worth sending to a friend', max: 15, kind: 'J', full: 'People have a reason to send it on.',
          half: 'It is nice, but there is no reason to send it.', none: 'It reads like an ad.', fix: 'Give people a reason to send it: news, a reveal, how it was made or a date.' },
        { id: 'own', label: 'Made by you, and you are in it', max: 10, kind: 'J', full: 'Your own footage, with you in it.',
          half: 'Your footage, but you are hard to see or hear.', none: 'It is mostly someone else\'s material.', fix: 'Use your own footage with your face, voice or hands in it.' },
        { id: 'ontext', label: 'One short line on screen', max: 5, kind: 'J', full: 'One plain line on screen says what this is.',
          half: 'The words on screen are crowded or sit under the buttons.', none: 'No words on screen.', fix: 'Add one short line early, clear of the top and bottom where the buttons sit.' },
        { id: 'song', label: 'Your song on it', max: 10, kind: 'M', full: 'Your song plays on it.',
          half: 'Your song is not on it.', none: 'Your song is not on it.', fix: 'Put your song on it in Add audio.' },
        { id: 'length', label: 'Length', max: 5, kind: 'M', full: 'A good length.',
          half: 'Under 7 seconds is too short to land.', none: 'Reels of 3 minutes or more got about half the reach.', fix: 'Keep it between 7 seconds and 2 minutes 59.' },
        { id: 'shape', label: 'Shape and size', max: 5, kind: 'M', full: 'Tall 9:16 and sharp.',
          half: 'Not quite the tall 9:16 shape, or small.', none: 'Square or wide, so it shows small.', fix: 'Film it tall (9:16) at 1080 by 1920.' },
        { id: 'caption', label: 'Caption', max: 10, kind: 'M', full: 'The caption does its job.',
          half: 'The caption misses a few things.', none: 'The caption misses most things.', fix: 'Tighten the caption.' },
        { id: 'tags', label: 'Tags and location', max: 5, kind: 'M', full: 'People and a place are tagged.',
          half: 'Only part of the tags are there.', none: 'Nobody and no place is tagged.', fix: 'Tag the people in it (or invite them as a Collab) and add a location.' },
        { id: 'time', label: 'Time to post', max: 5, kind: 'M', full: 'A strong time to post.',
          half: 'Not the strongest time.', none: 'A quiet time to post.', fix: 'Post at a better time today.' }
      ],
      carousel: [
        { id: 'first', label: 'First photo stops the scroll', max: 15, kind: 'J', full: 'The first photo stops the scroll.',
          half: 'The first photo is fine but plain.', none: 'The first photo is blurry, flat or mostly text.', fix: 'Lead with a person or a striking real moment, with a short title or date on an announcement.' },
        { id: 'slide2', label: 'Slide 2 opens it again, no filler', max: 10, kind: 'J', full: 'Every slide earns its place.',
          half: 'Some slides are filler.', none: 'The slides repeat each other.', fix: 'Make slide 2 a second opener and cut the filler.' },
        { id: 'send', label: 'Worth saving or sending', max: 15, kind: 'J', full: 'People have a reason to save or send it.',
          half: 'It is nice, but there is no reason to save or send it.', none: 'It reads like an ad.', fix: 'Give people a reason to save or send it: news, a date, how it was made.' },
        { id: 'own', label: 'Made by you, and you are in it', max: 10, kind: 'J', full: 'Your own photos, with you in them.',
          half: 'Your photos, but you are hard to see.', none: 'Reposted flyers, screenshots or someone else\'s photos.', fix: 'Use your own photos, with you in them.' },
        { id: 'song', label: 'Your song on it', max: 15, kind: 'M', full: 'Your song plays on it.',
          half: 'Your song is not on it.', none: 'Your song is not on it, so it cannot play in the Reels feed.', fix: 'Put your song on it. A carousel with your song can play in the Reels feed.' },
        { id: 'slides', label: 'Number of slides', max: 10, kind: 'M', full: 'Three or more slides.',
          half: 'Only two slides.', none: 'Only two slides.', fix: 'Add a third slide.' },
        { id: 'shape', label: 'Shape and size', max: 5, kind: 'M', full: 'All one tall shape, sharp.',
          half: 'Mixed or wide shapes.', none: 'Mixed or wide shapes, and small.', fix: 'Use SIGNAL\'s 4:5 versions.' },
        { id: 'caption', label: 'Caption', max: 10, kind: 'M', full: 'The caption does its job.',
          half: 'The caption misses a few things.', none: 'The caption misses most things.', fix: 'Tighten the caption.' },
        { id: 'tags', label: 'Tags and location', max: 5, kind: 'M', full: 'People and a place are tagged.',
          half: 'Only part of the tags are there.', none: 'Nobody and no place is tagged.', fix: 'Tag the people in it (or invite them as a Collab) and add a location.' },
        { id: 'time', label: 'Time to post', max: 5, kind: 'M', full: 'A strong time to post.',
          half: 'Not the strongest time.', none: 'A quiet time to post.', fix: 'Post at a better time today.' }
      ],
      photo: [
        { id: 'stop', label: 'The photo stops the scroll', max: 20, kind: 'J', full: 'The photo stops the scroll on its own.',
          half: 'The photo is fine but plain.', none: 'The photo is blurry, flat or mostly text.', fix: 'Use a photo of a person or a striking real moment.' },
        { id: 'send', label: 'Worth sending', max: 15, kind: 'J', full: 'People have a reason to send it on.',
          half: 'It is nice, but there is no reason to send it.', none: 'It reads like an ad.', fix: 'Give people a reason to send it: news, a date, a moment.' },
        { id: 'own', label: 'Made by you, and you are in it', max: 10, kind: 'J', full: 'Your own photo, with you in it.',
          half: 'Your photo, but you are hard to see.', none: 'A reposted flyer, screenshot or someone else\'s photo.', fix: 'Use your own photo, with you in it.' },
        { id: 'sharp', label: 'Sharp and clean', max: 5, kind: 'J', full: 'Sharp and clean.',
          half: 'A little soft or busy.', none: 'Blurry, a screenshot or mostly text.', fix: 'Use a sharp photo, not a screenshot.' },
        { id: 'format', label: 'Format', max: 10, kind: 'M', full: 'A strong format.',
          half: 'A single photo is the weakest format right now.', none: 'A single photo is the weakest format right now.', fix: 'Add 2 or more photos to make it a carousel.' },
        { id: 'song', label: 'Your song on it', max: 15, kind: 'M', full: 'Your song plays on it.',
          half: 'Your song is not on it.', none: 'Your song is not on it.', fix: 'Put your song on it in Add audio.' },
        { id: 'shape', label: 'Shape and size', max: 5, kind: 'M', full: 'Tall and sharp.',
          half: 'Square, so it shows smaller.', none: 'Wide, so it shows small.', fix: 'Use SIGNAL\'s 4:5 version.' },
        { id: 'caption', label: 'Caption', max: 10, kind: 'M', full: 'The caption does its job.',
          half: 'The caption misses a few things.', none: 'The caption misses most things.', fix: 'Tighten the caption.' },
        { id: 'tags', label: 'Tags and location', max: 5, kind: 'M', full: 'People and a place are tagged.',
          half: 'Only part of the tags are there.', none: 'Nobody and no place is tagged.', fix: 'Tag the people in it (or invite them as a Collab) and add a location.' },
        { id: 'time', label: 'Time to post', max: 5, kind: 'M', full: 'A strong time to post.',
          half: 'Not the strongest time.', none: 'A quiet time to post.', fix: 'Post at a better time today.' }
      ]
    },
    tiktok: {
      video: [
        { id: 'hook', label: 'Best moment in the first 2 seconds', max: 20, kind: 'J', full: 'It opens on the best moment.',
          half: 'The best moment comes a second or two in.', none: 'It starts with an intro.', fix: 'Start on the drop or the best moment, with no intro, so it can loop.' },
        { id: 'watch', label: 'Keeps people watching to the end', max: 15, kind: 'J', full: 'People have a reason to stay to the end.',
          half: 'It slows down in the middle.', none: 'There is no reason to stay.', fix: 'Keep the pace up, give a reason to stay, or make it loop.' },
        { id: 'share', label: 'Worth sharing', max: 10, kind: 'J', full: 'People have a reason to share it.',
          half: 'It is nice, but there is no reason to share it.', none: 'It reads like an ad.', fix: 'Show how it was made, the sound design, or a reveal.' },
        { id: 'own', label: 'Made by you, nothing reused', max: 10, kind: 'J', full: 'Your own video.',
          half: 'Partly reused clips.', none: 'Reused clips with nothing new added cannot reach For You.', fix: 'Use your own footage, or add something new to anything reused.' },
        { id: 'ontext', label: 'Plain words on screen early', max: 5, kind: 'J', full: 'Plain words on screen in the first 3 seconds.',
          half: 'The words on screen come late or are hard to read.', none: 'No words on screen.', fix: 'Put plain words on screen in the first 3 seconds: the genre or the song.' },
        { id: 'song', label: 'Your song as the sound', max: 10, kind: 'M', full: 'Your song is the sound.',
          half: 'Your song is not the sound.', none: 'Your song is not the sound.', fix: 'Use your song as the sound.' },
        { id: 'length', label: 'Length', max: 5, kind: 'M', full: 'A good length.',
          half: 'A little long or short.', none: 'Too short or too long.', fix: 'Keep it between 7 and 60 seconds.' },
        { id: 'shape', label: 'Shape and size', max: 5, kind: 'M', full: 'Tall 9:16 and sharp.',
          half: 'Not quite the tall 9:16 shape, or small.', none: 'Square or wide, so it shows small.', fix: 'Film it tall (9:16) at 1080 by 1920.' },
        { id: 'caption', label: 'Caption', max: 10, kind: 'M', full: 'The caption does its job.',
          half: 'The caption misses a few things.', none: 'The caption misses most things.', fix: 'Tighten the caption.' },
        { id: 'tags', label: 'Tags and location', max: 5, kind: 'M', full: 'People and a place are tagged.',
          half: 'Only part of the tags are there.', none: 'Nobody and no place is tagged.', fix: 'Tag the people in it and add a location.' },
        { id: 'time', label: 'Time to post', max: 5, kind: 'M', full: 'A strong time to post.',
          half: 'Not the strongest time.', none: 'A quiet time to post.', fix: 'Post at a better time today.' }
      ],
      photos: [
        { id: 'first', label: 'First photo stops the scroll', max: 15, kind: 'J', full: 'The first photo stops the scroll.',
          half: 'The first photo is fine but plain.', none: 'The first photo is blurry, flat or mostly text.', fix: 'Lead with a person or a striking real moment.' },
        { id: 'each', label: 'Each photo adds something', max: 10, kind: 'J', full: 'Every photo adds something.',
          half: 'Some photos repeat each other.', none: 'The photos repeat each other.', fix: 'Cut the photos that repeat; make each one add something.' },
        { id: 'share', label: 'Worth sharing', max: 10, kind: 'J', full: 'People have a reason to share it.',
          half: 'It is nice, but there is no reason to share it.', none: 'It reads like an ad.', fix: 'Give people a reason to share it: news, a date, how it was made.' },
        { id: 'own', label: 'Made by you', max: 10, kind: 'J', full: 'Your own photos.',
          half: 'Partly reused pictures.', none: 'Reposted flyers, screenshots or someone else\'s photos.', fix: 'Use your own photos.' },
        { id: 'format', label: 'Format', max: 10, kind: 'M', full: 'A strong format.',
          half: 'Video reaches about 5 times as many people as photos.', none: 'Video reaches about 5 times as many people as photos.', fix: 'Make it a video that plays your song.' },
        { id: 'song', label: 'Your song as the sound', max: 15, kind: 'M', full: 'Your song is the sound.',
          half: 'Your song is not the sound.', none: 'Your song is not the sound.', fix: 'Use your song as the sound.' },
        { id: 'count', label: 'Number of photos', max: 5, kind: 'M', full: 'Three or more photos.',
          half: 'Only two photos.', none: 'Only one photo.', fix: 'Add more photos: three or more do best.' },
        { id: 'shape', label: 'Shape and size', max: 5, kind: 'M', full: 'All tall 9:16, sharp.',
          half: 'Not all tall 9:16, or small.', none: 'Not tall and small.', fix: 'Use SIGNAL\'s 9:16 versions.' },
        { id: 'caption', label: 'Caption', max: 10, kind: 'M', full: 'The caption does its job.',
          half: 'The caption misses a few things.', none: 'The caption misses most things.', fix: 'Tighten the caption.' },
        { id: 'tags', label: 'Tags and location', max: 5, kind: 'M', full: 'People and a place are tagged.',
          half: 'Only part of the tags are there.', none: 'Nobody and no place is tagged.', fix: 'Tag the people in it and add a location.' },
        { id: 'time', label: 'Time to post', max: 5, kind: 'M', full: 'A strong time to post.',
          half: 'Not the strongest time.', none: 'A quiet time to post.', fix: 'Post at a better time today.' }
      ]
    }
  };
  var PB_PLATFORMS = { instagram: 'Instagram', tiktok: 'TikTok' };
  var METER_BANDS = [
    { key: 'peak', name: 'Peak', min: 90, max: 100, tone: 'brand' },
    { key: 'strong', name: 'Strong', min: 70, max: 89, tone: 'brand' },
    { key: 'moderate', name: 'Moderate', min: 40, max: 69, tone: 'part' },
    { key: 'weak', name: 'Weak', min: 0, max: 39, tone: 'neg' }
  ];
  function clampScore(n) { var x = typeof n === 'number' ? n : parseFloat(n); return isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0; }
  function meterBand(score) {
    var s = clampScore(score);
    for (var i = 0; i < METER_BANDS.length; i++) {
      var b = METER_BANDS[i];
      if (s >= b.min) return { key: b.key, name: b.name, min: b.min, max: b.max, tone: b.tone, score: s };
    }
    return null;
  }
  function pbFormat(platform, format) {
    if (platform === 'tiktok') return format === 'carousel' || format === 'photo' || format === 'photos' ? 'photos' : 'video';
    return format === 'carousel' ? 'carousel' : format === 'photo' ? 'photo' : 'reel';
  }
  function pbRules(platform, fmt) {
    var p = PB_RULES[platform === 'tiktok' ? 'tiktok' : 'instagram'];
    return p[pbFormat(platform === 'tiktok' ? 'tiktok' : 'instagram', fmt)] || null;
  }
  var PB_BANNED = {
    instagram: ['fyp', 'foryou', 'foryoupage', 'viral', 'explore', 'reels'],
    tiktok: ['fyp', 'foryou', 'foryoupage', 'viral']
  };
  var PB_ASK = /\?|\b(?:send (?:this|it)|save (?:this|it)|tell me|which|what do you)\b/i;
  var PB_LETTER = /[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ]/;
  function hasWords(hay, needle) {
    var n = String(needle || '').trim().toLowerCase();
    return !!n && String(hay || '').toLowerCase().indexOf(n) >= 0;
  }
  function firstLineOf(caption) {
    var lines = String(caption || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    return lines.length ? lines[0] : '';
  }
  function hashtagsOf(caption) { return (String(caption || '').match(/#[^\s#@.,!?;:]+/g) || []).map(function (t) { return t.slice(1); }); }
  function captionChecks(platform, caption, ctx) {
    ctx = ctx || {};
    var text = String(caption || ''), first = firstLineOf(text), firstLen = codePoints(first).length;
    var tags = hashtagsOf(text), banned = PB_BANNED[platform === 'tiktok' ? 'tiktok' : 'instagram'];
    var bannedHit = tags.filter(function (t) { return banned.indexOf(t.toLowerCase()) >= 0; });
    var bait = PostScore.analyzeCaption(text).bait;
    var asks = PB_ASK.test(text);
    var named = hasWords(text, ctx.song) || hasWords(text, ctx.artist);
    var nameFix = ctx.song ? 'Name the song, "' + ctx.song + '", in the caption.' : 'Name the song or the artist in the caption.';
    if (platform === 'tiktok') {
      var plain = first.replace(/[#@][^\s]+/g, ' ');
      return [
        { id: 'plain', label: 'Plain first line', ok: PB_LETTER.test(plain), pts: 2, fix: 'Start with a plain line of words, not only hashtags or emoji.' },
        { id: 'named', label: 'Names the song or the artist', ok: named, pts: 2, fix: nameFix + ' People search TikTok with words.' },
        { id: 'count', label: '1 to 5 hashtags', ok: tags.length >= 1 && tags.length <= 5, pts: 2, fix: tags.length ? 'Cut to 5 hashtags or fewer.' : 'Add 1 to 5 hashtags that say what it is, like the genre.' },
        { id: 'banned', label: 'No #fyp-style tags', ok: !bannedHit.length, pts: 2, fix: 'Take out ' + (bannedHit.length ? '#' + bannedHit.join(', #') : '#fyp-style tags') + '. They do nothing.' },
        { id: 'ask', label: 'Asks something real, no bait', ok: asks && !bait.length, pts: 2,
          fix: bait.length ? 'Take out "' + bait[0] + '". TikTok keeps posts that beg for likes or follows out of For You.' : 'Ask one real question people can answer.' }
      ];
    }
    var hookOk = firstLen >= 1 && firstLen <= 125 && !/^[#@]/.test(first) && !/^(?:https?:|www\.)/i.test(first) && /^["'“‘(]?[A-Za-z0-9À-ɏͰ-ϿЀ-ӿ]/.test(first);
    return [
      { id: 'hook', label: 'First line is a hook', ok: hookOk, pts: 2, fix: firstLen > 125 ? 'Cut the first line to under 125 characters. It is all people see before "more".' : 'Open with a line of words that makes people stop. It is all they see before "more".' },
      { id: 'named', label: 'Names the song or the artist', ok: named, pts: 2, fix: nameFix },
      { id: 'ask', label: 'Asks something real', ok: asks, pts: 2, fix: 'Ask one real question, or ask people to send it to someone.' },
      { id: 'tags', label: '5 hashtags or fewer, no #fyp-style tags', ok: tags.length <= 5 && !bannedHit.length, pts: 2,
        fix: bannedHit.length ? 'Take out #' + bannedHit.join(', #') + '. They do nothing.' : 'Cut to 5 hashtags or fewer.' },
      { id: 'bait', label: 'No bait', ok: !bait.length, pts: 2, fix: bait.length ? 'Take out "' + bait[0] + '". Begging for likes cuts likes.' : '' }
    ];
  }
  var zoneFormats = {};
  function zoneParts(ms, tz) {
    tz = tz || LA;
    if (tz === LA) { var p = pacificParts(ms); return { date: p.date, time: p.time, weekday: p.weekday, hour: p.hour, minute: p.minute }; }
    try {
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        var f = zoneFormats[tz] || (zoneFormats[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
        var o = {};
        f.formatToParts(new Date(ms)).forEach(function (x) { o[x.type] = x.value; });
        if (+o.year && +o.month && +o.day) {
          var date = o.year + '-' + o.month + '-' + o.day, hh = (+o.hour) % 24, mi = +o.minute;
          return { date: date, time: pad2(hh) + ':' + pad2(mi), weekday: weekdayOf(date), hour: hh, minute: mi };
        }
      }
    } catch (e) {   }
    var d = new Date(ms), dd = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    return { date: dd, time: pad2(d.getHours()) + ':' + pad2(d.getMinutes()), weekday: d.getDay(), hour: d.getHours(), minute: d.getMinutes() };
  }
  function zoneInstant(date, time, tz) {
    tz = tz || LA;
    if (tz === LA) return pacificInstant(date, time);
    var a = dayMs(date), m = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
    if (a === null || !m || +m[1] > 23 || +m[2] > 59) return null;
    var target = a + (+m[1]) * 3600000 + (+m[2]) * 60000, guess = target;
    for (var i = 0; i < 3; i++) {
      var p = zoneParts(guess, tz), had = dayMs(p.date);
      if (had === null) return null;
      guess += target - (had + p.hour * 3600000 + p.minute * 60000);
    }
    return guess;
  }
  function bestInstant(best, nowMs) {
    if (!best || !best.local) return null;
    if (best.inWindow) return nowMs;
    return zoneInstant(best.day === 'tomorrow' ? addDays(best.local.date, 1) : best.local.date, best.at, best.zone);
  }
  function zoneCity(tz) { return String(tz || LA).split('/').pop().replace(/_/g, ' '); }
  function postWindows(platform, weekday) {
    if (platform === 'tiktok') {
      if (weekday === 0) return [[9, 11], [19, 21]];
      if (weekday === 6) return [[19, 21]];
      return [[15, 17], [19, 21]];
    }
    return [[9, 10], [11, 14], [18, 21]];
  }
  function inWindows(platform, weekday, hour) {
    return postWindows(platform, weekday).some(function (w) { return hour >= w[0] && hour < w[1]; });
  }
  function timePoints(platform, weekday, hour, releaseDay) {
    var pts;
    if (inWindows(platform, weekday, hour)) {
      if (platform === 'tiktok') pts = weekday === 3 ? 3 : 5;
      else pts = weekday === 3 || weekday === 4 ? 5 : weekday === 0 || weekday === 6 ? 3 : 4;
    } else pts = hour >= 7 && hour < 23 ? 2 : 1;
    if (releaseDay && platform !== 'tiktok') pts = Math.max(pts, 4);
    return pts;
  }
  function clockWords(hh, mm) { return (hh % 12 || 12) + (mm ? ':' + pad2(mm) : '') + (hh < 12 ? ' AM' : ' PM'); }
  function spanWords(w) {
    var a = w[0], b = w[1], am = function (x) { return x < 12 ? 'AM' : 'PM'; };
    return (am(a) === am(b) ? (a % 12 || 12) : clockWords(a, 0)) + ' to ' + clockWords(b, 0);
  }
  function windowWords(platform, weekday) {
    var wins = postWindows(platform === 'tiktok' ? 'tiktok' : 'instagram', typeof weekday === 'number' ? weekday : 3).map(spanWords);
    return 'Post at ' + (wins.length > 1 ? wins.slice(0, -1).join(', ') + ' or ' + wins[wins.length - 1] : wins[0]) + ', your audience\'s time.';
  }
  var DAY_FIX = {
    instagram: 'Post on a Wednesday or Thursday, the strongest days. Release day always counts as strong.',
    tiktok: 'Post on a weekday afternoon or Sunday morning. Wednesday is the weakest day.'
  };
  var BEST_WHY = {
    instagram: 'Weekday lunch and early evening do best. Wednesday and Thursday are the strongest days.',
    tiktok: 'Weekday afternoons, 8 PM and Sunday morning do best. Wednesday is the weakest day.'
  };
  var BEST_SOON = {
    instagram: 'Most views come in the first 3 days, so post when you can answer comments.',
    tiktok: 'Most views come in the first 10 days, so post when you can answer comments.'
  };
  function bestTime(platform, nowMs, timeZone, opts) {
    var o = typeof opts === 'object' && opts ? opts : { releaseToday: !!opts };
    platform = platform === 'tiktok' ? 'tiktok' : 'instagram';
    var tz = timeZone || LA, p = zoneParts(nowMs, tz), city = zoneCity(tz);
    var wins = postWindows(platform, p.weekday), mins = p.hour * 60 + p.minute, out;
    var now = wins.filter(function (w) { return mins >= w[0] * 60 && mins < w[1] * 60; })[0];
    var next = wins.filter(function (w) { return w[0] * 60 > mins; })[0];
    if (now) out = { inWindow: true, at: p.time, day: 'today', words: 'Now is a good time (' + city + ' time).' };
    else if (next) out = { inWindow: false, at: pad2(next[0]) + ':00', day: 'today', words: 'Today at ' + clockWords(next[0], 0) + ' (' + city + ' time).' };
    else {
      var tw = postWindows(platform, (p.weekday + 1) % 7)[0];
      out = { inWindow: false, at: pad2(tw[0]) + ':00', day: 'tomorrow',
        words: 'Today\'s best times have passed. Post now, or tomorrow at ' + clockWords(tw[0], 0) + ' (' + city + ' time).' };
    }
    out.why = BEST_WHY[platform];
    if (o.releaseToday && platform === 'instagram') out.why += ' It is the song\'s release day, so any time today counts as strong.';
    out.soon = BEST_SOON[platform];
    if (platform === 'tiktok' && o.igNear) out.soon += ' Don\'t post the same clip on Instagram and TikTok at the same time.';
    out.zone = tz; out.city = city; out.local = p;
    return out;
  }
  function shapeOf(w, h) { return w > 0 && h > 0 ? w / h : null; }
  function near(r, target, pct) { return r !== null && Math.abs(r - target) / target <= (pct || 0.03); }
  function measurePost(draft, ctx) {
    draft = draft || {}; ctx = ctx || {};
    var platform = draft.platform === 'tiktok' ? 'tiktok' : 'instagram', fmt = pbFormat(platform, draft.format);
    var media = draft.media || {}, n = Math.max(0, Math.floor(+media.count || 0)), sec = +media.seconds;
    var w = +media.width || 0, h = +media.height || 0, r = shapeOf(w, h), short = Math.min(w || 0, h || 0);
    var shapes = Array.isArray(media.shapes) && media.shapes.length ? media.shapes : (w && h ? [[w, h]] : []);
    var song = draft.song && draft.song.title ? draft.song : null;
    var items = {}, gate = { capped: false, why: '' };
    var put = function (id, got, note) { items[id] = { got: got, note: note || '' }; };
    var songMax = fmt === 'carousel' || fmt === 'photo' || fmt === 'photos' ? 15 : 10;
    put('song', song ? songMax : 0, song ? '' : (platform === 'tiktok' ? 'Your song is not the sound.' : 'Your song is not on it.'));
    if (fmt === 'reel' || fmt === 'video') {
      if (!(sec > 0)) put('length', 0, 'The length could not be read.');
      else if (platform === 'tiktok') {
        put('length', sec < 7 ? 2 : sec <= 60 ? 5 : sec <= 180 ? 4 : 2,
          sec < 7 ? 'Under 7 seconds is too short to land.' : sec > 180 ? 'Over 3 minutes.' : sec > 60 ? 'A little long: 7 to 60 seconds does best.' : '');
      } else if (sec >= 180) {
        put('length', 0, 'Reels of 3 minutes or more got about half the reach.');
        gate = { capped: true, why: 'Reels of 3 minutes or more got about half the reach, so the score stops at 40.' };
      } else put('length', sec < 7 ? 3 : 5, sec < 7 ? 'Under 7 seconds is too short to land.' : '');
      var tall = near(r, 9 / 16), anyTall = r !== null && r < 1;
      var sz = short >= 1080 ? 2 : short >= 720 ? 1 : 0;
      put('shape', (tall ? 3 : anyTall ? 1 : 0) + sz, !r ? 'The size could not be read.' : !tall ? (anyTall ? 'Not quite the tall 9:16 shape.' : 'Square or wide, so it shows small.') : sz < 2 ? 'Smaller than 1080 wide, so it looks soft.' : '');
    } else if (fmt === 'carousel' || fmt === 'photos') {
      if (fmt === 'carousel') put('slides', n >= 3 ? 10 : n === 2 ? 6 : 0, n >= 3 ? '' : 'Only ' + n + ' slide' + (n === 1 ? '' : 's') + '.');
      else put('count', n >= 3 ? 5 : n === 2 ? 3 : n === 1 ? 1 : 0, n >= 3 ? '' : 'Only ' + n + ' photo' + (n === 1 ? '' : 's') + '.');
      var ratios = shapes.map(function (s) { return shapeOf(+s[0], +s[1]); });
      var shorts = shapes.map(function (s) { return Math.min(+s[0] || 0, +s[1] || 0); });
      var minShort = shorts.length ? Math.min.apply(null, shorts) : 0;
      if (fmt === 'carousel') {
        var one = ratios.length > 0 && ratios.every(function (x) { return x !== null && Math.abs(x - ratios[0]) / ratios[0] <= 0.03; });
        var tallC = ratios.length > 0 && ratios.every(function (x) { return near(x, 4 / 5) || near(x, 3 / 4); });
        put('shape', (one ? 2 : 0) + (tallC ? 2 : 0) + (minShort >= 1080 ? 1 : 0), !ratios.length ? 'The sizes could not be read.' : !one ? 'The photos are not all one shape.' : !tallC ? 'Not the tall 4:5 shape.' : minShort < 1080 ? 'Smaller than 1080 wide, so they look soft.' : '');
      } else {
        var allTall = ratios.length > 0 && ratios.every(function (x) { return near(x, 9 / 16); });
        put('shape', (allTall ? 3 : 0) + (minShort >= 1080 ? 2 : 0), !ratios.length ? 'The sizes could not be read.' : !allTall ? 'Not all tall 9:16.' : minShort < 1080 ? 'Smaller than 1080 wide, so they look soft.' : '');
      }
      if (fmt === 'photos') put('format', 3, 'Video reaches about 5 times as many people as photos.');
    } else {
      put('format', 4, 'A single photo is the weakest format right now.');
      var sz1 = short >= 1080 ? 2 : 0;
      var sh = r === null ? 0 : (near(r, 4 / 5) || near(r, 3 / 4)) ? 3 : near(r, 1) ? 1 : r < 1 ? 1 : 0;
      put('shape', sh + sz1, r === null ? 'The size could not be read.' : sh === 3 ? (sz1 ? '' : 'Smaller than 1080 wide, so it looks soft.') : sh === 1 ? 'Square, so it shows smaller than 4:5.' : 'Wide, so it shows small.');
    }
    var checks = captionChecks(platform, draft.caption, { song: song ? song.title : '', artist: draft.artist || '' });
    var capGot = checks.reduce(function (s, c) { return s + (c.ok ? c.pts : 0); }, 0);
    var missed = checks.filter(function (c) { return !c.ok; });
    items.caption = { got: capGot, note: missed.length ? missed.map(function (c) { return c.label; }).join(', ') + ': not yet.' : '', checks: checks };
    var tagged = Array.isArray(draft.tags) && draft.tags.filter(function (t) { return String(t || '').trim(); }).length > 0;
    var placed = !!String(draft.location || '').trim();
    put('tags', (tagged ? 3 : 0) + (placed ? 2 : 0), tagged && placed ? '' : !tagged && !placed ? 'Nobody and no place is tagged.' : !tagged ? 'Nobody is tagged.' : 'No location.');
    var at = typeof draft.at === 'number' && isFinite(draft.at) ? draft.at : typeof ctx.now === 'number' && isFinite(ctx.now) ? ctx.now : 0;
    var zp = zoneParts(at, ctx.timeZone || LA);
    var relDay = !!(song && song.release_day && song.release_day === zp.date);
    var tp = timePoints(platform, zp.weekday, zp.hour, relDay);
    put('time', tp, tp >= 5 ? '' : 'Not the strongest time to post.');
    return { items: items, gate: gate, platform: platform, fmt: fmt };
  }
  function intIn(v, max) { var x = Math.round(+v); return isFinite(x) ? Math.max(0, Math.min(max, x)) : 0; }
  function heldWords(rule, it) {
    if (rule.kind === 'J' && !it.checked) return rule.label + ': not checked this time.';
    if (it.note) return it.note;
    return it.got * 2 >= rule.max ? rule.half : (rule.none || rule.half);
  }
  function scorePost(platform, fmt, measured, judged, gates) {
    platform = platform === 'tiktok' ? 'tiktok' : 'instagram';
    var rules = pbRules(platform, fmt) || [];
    var m = measured && measured.items ? measured.items : (measured || {});
    var g = gates || (measured && measured.gate) || {};
    var looked = !!judged && typeof judged === 'object';
    var items = rules.map(function (r) {
      var src = r.kind === 'J' ? (looked ? judged[r.id] : null) : m[r.id];
      var v = src && typeof src === 'object' ? src.got : src;
      var got, checked = true;
      if (r.kind === 'J' && !looked) { got = Math.floor(r.max / 2); checked = false; } else got = intIn(v, r.max);
      return { id: r.id, label: r.label, max: r.max, got: got, kind: r.kind, checked: checked,
        note: src && typeof src === 'object' && src.note ? String(src.note).slice(0, 200) : '' };
    });
    var raw = items.reduce(function (s, it) { return s + it.got; }, 0);
    var capped = !!(g && g.capped);
    var score = capped ? Math.min(raw, 40) : raw;
    var byId = {};
    rules.forEach(function (r) { byId[r.id] = r; });
    var fixes = items.filter(function (it) { return it.got < it.max; }).map(function (it) {
      var r = byId[it.id], words = r.fix;
      if (it.id === 'caption' && m.caption && m.caption.checks) {
        var miss = m.caption.checks.filter(function (c) { return !c.ok && c.fix; });
        if (miss.length) words = miss[0].fix;
      }
      return { id: it.id, pts: it.max - it.got, words: words };
    }).sort(function (a, b) { return b.pts - a.pts; });
    var helped = items.filter(function (it) { return it.got >= it.max; }).map(function (it) { return byId[it.id].full; });
    var held = items.filter(function (it) { return it.got < it.max; }).sort(function (a, b) { return (b.max - b.got) - (a.max - a.got); })
      .map(function (it) { return heldWords(byId[it.id], it); });
    var band = meterBand(score);
    var why = score >= 100 ? 'It\'s at Peak. After you post, answer comments in the first few hours to keep it there.'
      : fixes.length ? fixes[0].words : '';
    if (!looked) why = 'SIGNAL couldn\'t look at the pictures this time, so it counted the middle. ' + why;
    if (capped) why = (g.why || 'The score stops at 40.') + ' ' + why;
    return { score: score, band: band, items: items, fixes: fixes, helped: helped, held: held, why: why.trim(), judged: looked,
      capped: capped, gateWhy: capped ? (g.why || '') : '', platform: platform, fmt: pbFormat(platform, fmt) };
  }
  function roundUpNice(x) {
    if (!(x > 0)) return 0;
    if (x < 100) return Math.ceil(x / 5) * 5;
    if (x < 1000) return Math.ceil(x / 10) * 10;
    return Math.ceil(x / 100) * 100;
  }
  function plainHandle(s) { return String(s || '').replace(/^@+/, '').trim().toLowerCase(); }
  function isoMs(s) { var t = Date.parse(String(s || '')); return isFinite(t) ? t : null; }
  function postTargets(room, platform, account, format, opts) {
    room = room || {}; opts = opts || {};
    var who = plainHandle(account), results = Array.isArray(room.results) ? room.results : [];
    var resOf = function (p) {
      var mine = results.filter(function (r) { return r && r.post_id === p.id; });
      return mine.filter(function (r) { return r.checkpoint === '24h'; })[0] || mine.filter(function (r) { return r.checkpoint === '7d'; })[0] || null;
    };
    var pool = (Array.isArray(room.posts) ? room.posts : []).filter(function (p) {
      if (!p || (p.platform || 'instagram') !== platform) return false;
      var a = plainHandle(p.account);
      return a === who || (!a && !!opts.first);
    }).map(function (p) { return { p: p, r: resOf(p) }; }).filter(function (x) {
      if (!x.r) return false;
      var boosted = typeof x.r.boosted === 'boolean' ? x.r.boosted : !!x.p.boosted;
      return !boosted;
    }).sort(function (a, b) {
      return (isoMs(b.p.posted_at) || isoMs(b.p.planned_at) || 0) - (isoMs(a.p.posted_at) || isoMs(a.p.planned_at) || 0);
    }).slice(0, 5);
    var same = pool.filter(function (x) { return x.p.format === format; });
    if (same.length >= 3) pool = same;
    var used7d = pool.some(function (x) { return x.r.checkpoint === '7d'; });
    var out = { views: null, likes: null, comments: null, median: {}, n: pool.length, sameFormat: same.length >= 3 };
    ['views', 'likes', 'comments'].forEach(function (k) {
      var vals = pool.map(function (x) { return x.r[k]; }).filter(function (v) { return typeof v === 'number' && isFinite(v); });
      if (vals.length < 3) return;
      var md = median(vals);
      out.median[k] = md;
      var t = roundUpNice(md * 2);
      if (k === 'views') t = Math.max(300, t);
      out[k] = t;
    });
    if (out.views === null && out.likes === null && out.comments === null) return null;
    out.basis = 'Double the middle of your last ' + pool.length + (out.sameFormat ? ' ' + (FORMAT_PLURAL[format] || 'posts') : ' posts') +
      ' that weren\'t boosted, after 24 hours' + (used7d ? ' (or 7 days, where that is all there is)' : '') + '.';
    return out;
  }
  var FORMAT_PLURAL = { photo: 'photo posts', carousel: 'carousels', reel: 'Reels', video: 'videos' };
  function boostLine(platform, hasSong, fmt) {
    var out = ['If it gets there in its first 24 hours, it beat your normal: that\'s your go to boost it.'];
    if (platform === 'tiktok') out.push('Boost only a video that uses your song.');
    else if (!hasSong && fmt === 'reel') out.push('Put your song on it before you boost, so the boost carries your song.');
    else if (!hasSong) out.push('A photo boost can\'t carry your song. If this one hits the target, boost a Reel with the song instead.');
    return out.join(' ');
  }
  function utf8Bytes(s) {
    s = String(s); var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function jsonBytes(o) { return utf8Bytes(JSON.stringify(o)); }
  function cutWords(s, n) { var cp = codePoints(String(s || '')); return cp.length > n ? cp.slice(0, n - 1).join('') + '…' : cp.join(''); }
  var PACK_LIMIT = 7600;
  function packAnswers(result, extra) {
    result = result || {}; extra = extra || {};
    var a = { v: PLAYBOOK_VERSION, fmt: result.fmt || '', judged: !!result.judged,
      items: (result.items || []).map(function (it) { return [it.id, it.got]; }),
      fixes: (result.fixes || []).map(function (f) { return [f.pts, String(f.words || '')]; }),
      helped: (result.helped || []).map(String), held: (result.held || []).map(String) };
    if (result.capped) a.capped = String(result.gateWhy || 'capped');
    if (extra.before != null) a.before = String(extra.before);
    if (extra.best) a.best = { at: String(extra.best.at || ''), words: String(extra.best.words || '') };
    if (extra.targets) a.targets = { views: extra.targets.views, likes: extra.targets.likes, comments: extra.targets.comments, basis: String(extra.targets.basis || '') };
    if (extra.media) a.media = { n: extra.media.count || extra.media.n || 0, w: extra.media.width || extra.media.w || 0, h: extra.media.height || extra.media.h || 0, sec: extra.media.seconds || extra.media.sec || 0 };
    if (Array.isArray(extra.tags)) a.tags = extra.tags.map(function (t) { return String(t); });
    if (extra.loc) a.loc = String(extra.loc);
    a.pinned = !!extra.pinned;
    if (jsonBytes(a) > PACK_LIMIT) delete a.before;
    if (jsonBytes(a) > PACK_LIMIT) {
      a.fixes = a.fixes.map(function (f) { return [f[0], cutWords(f[1], 140)]; });
      a.helped = a.helped.map(function (s) { return cutWords(s, 140); });
      a.held = a.held.map(function (s) { return cutWords(s, 140); });
      if (a.best) a.best.words = cutWords(a.best.words, 140);
      if (a.targets) a.targets.basis = cutWords(a.targets.basis, 140);
    }
    if (jsonBytes(a) > PACK_LIMIT) { delete a.helped; delete a.held; }
    if (jsonBytes(a) > PACK_LIMIT) { if (a.tags) a.tags = a.tags.slice(0, 10).map(function (t) { return cutWords(t, 60); }); if (a.loc) a.loc = cutWords(a.loc, 100); }
    if (jsonBytes(a) > PACK_LIMIT) a = { v: a.v, fmt: a.fmt, judged: a.judged, items: a.items, pinned: a.pinned };
    return a;
  }
  function readAnswers(post) {
    var a = post && post.answers;
    if (!a || typeof a !== 'object' || a.v !== PLAYBOOK_VERSION || !Array.isArray(a.items)) return null;
    var items = {};
    a.items.forEach(function (x) { if (Array.isArray(x) && typeof x[0] === 'string') items[x[0]] = +x[1]; });
    return { v: a.v, fmt: a.fmt || '', judged: !!a.judged, items: items, capped: a.capped || '',
      fixes: Array.isArray(a.fixes) ? a.fixes.filter(Array.isArray).map(function (f) { return { pts: +f[0] || 0, words: String(f[1] || '') }; }) : null,
      helped: Array.isArray(a.helped) ? a.helped.map(String) : null, held: Array.isArray(a.held) ? a.held.map(String) : null,
      before: typeof a.before === 'string' ? a.before : null, best: a.best || null, targets: a.targets || null, media: a.media || null,
      tags: Array.isArray(a.tags) ? a.tags.map(String) : [], loc: typeof a.loc === 'string' ? a.loc : '', pinned: !!a.pinned };
  }
  function postResult(post) {
    if (!post) return null;
    var platform = post.platform === 'tiktok' ? 'tiktok' : 'instagram';
    var a = readAnswers(post);
    if (a) {
      var fmt = a.fmt || pbFormat(platform, post.format);
      var measured = {}, judged = a.judged ? {} : null;
      (pbRules(platform, fmt) || []).forEach(function (r) {
        if (!(r.id in a.items)) return;
        if (r.kind === 'J') { if (judged) judged[r.id] = a.items[r.id]; } else measured[r.id] = a.items[r.id];
      });
      var res = scorePost(platform, fmt, measured, judged, a.capped ? { capped: true, why: a.capped === 'capped' ? '' : a.capped } : null);
      if (a.fixes && a.fixes.length) res.fixes = a.fixes.slice().sort(function (x, y) { return y.pts - x.pts; });
      if (a.helped) res.helped = a.helped;
      if (a.held) res.held = a.held;
      if (typeof post.score === 'number' && isFinite(post.score)) { res.score = clampScore(post.score); res.band = meterBand(res.score); }
      res.why = res.score >= 100 ? 'It\'s at Peak. After you post, answer comments in the first few hours to keep it there.'
        : (res.judged ? '' : 'SIGNAL couldn\'t look at the pictures this time, so it counted the middle. ') + (res.fixes.length ? res.fixes[0].words : '');
      res.source = 'playbook';
      return res;
    }
    var v1 = post.answers && typeof post.answers === 'object' && post.answers.st && PostScore.DEFS[post.answers.fmt] ? post.answers : null;
    if (v1) {
      var w = v1.when && typeof v1.when === 'object' ? postWhen({ date: v1.when.date, time: v1.when.time, release: !!v1.when.release }) : null;
      w = w || postWhen({ at: isoMs(post.posted_at) || isoMs(post.planned_at) || isoMs(post.created_at) || 0 });
      var r1 = PostScore.score(v1.fmt, v1.st, w);
      var score = typeof post.score === 'number' && isFinite(post.score) ? clampScore(post.score) : clampScore(r1.total);
      var fx = r1.moves.map(function (mv) {
        var words = mv.id === 'time' ? windowWords(platform) : mv.id === 'day' ? DAY_FIX[platform] : (mv.fix || mv.label);
        return { id: mv.id, pts: mv.gain, words: words };
      });
      return { score: score, band: meterBand(score), items: r1.items.map(function (it) { return { id: it.id, label: it.label, max: it.max, got: it.earned, kind: 'M', checked: true }; }),
        fixes: fx, helped: r1.items.filter(function (it) { return it.earned >= it.max; }).map(function (it) { return it.label; }),
        held: r1.items.filter(function (it) { return it.earned < it.max; }).map(function (it) { return it.label; }),
        why: score >= 100 ? 'It\'s at Peak. After you post, answer comments in the first few hours to keep it there.' : fx.length ? fx[0].words : '',
        judged: true, source: 'v1' };
    }
    if (typeof post.score === 'number' && isFinite(post.score)) {
      var s = clampScore(post.score);
      return { score: s, band: meterBand(s), items: [], fixes: [], helped: [], held: [], judged: true, source: 'score',
        why: s >= 100 ? 'It\'s at Peak. After you post, answer comments in the first few hours to keep it there.' : 'Score it again to see why.' };
    }
    return null;
  }
  function capTokens(s) { return String(s == null ? '' : s).match(/\s+|[^\s]+/g) || []; }
  function pushSeg(out, t, s) {
    if (!s) return;
    var last = out[out.length - 1];
    if (last && last.t === t) last.s += s; else out.push({ t: t, s: s });
  }
  function captionDiff(before, after) {
    var a = capTokens(before), b = capTokens(after), out = [];
    var p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    var q = 0;
    while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
    var A = a.slice(p, a.length - q), Bt = b.slice(p, b.length - q), n = A.length, m = Bt.length;
    pushSeg(out, 'same', a.slice(0, p).join(''));
    if (!n || !m || n * m > 4e6) {
      pushSeg(out, 'removed', A.join(''));
      pushSeg(out, 'added', Bt.join(''));
    } else {
      var W = m + 1, L = new Int32Array((n + 1) * W);
      for (var i = n - 1; i >= 0; i--) {
        for (var j = m - 1; j >= 0; j--) {
          L[i * W + j] = A[i] === Bt[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
        }
      }
      var x = 0, y = 0;
      while (x < n && y < m) {
        if (A[x] === Bt[y]) { pushSeg(out, 'same', A[x]); x++; y++; }
        else if (L[(x + 1) * W + y] >= L[x * W + y + 1]) { pushSeg(out, 'removed', A[x]); x++; }
        else { pushSeg(out, 'added', Bt[y]); y++; }
      }
      while (x < n) { pushSeg(out, 'removed', A[x]); x++; }
      while (y < m) { pushSeg(out, 'added', Bt[y]); y++; }
    }
    pushSeg(out, 'same', a.slice(a.length - q).join(''));
    var tidy = [], run = null;
    var flush = function () { if (run) { pushSeg(tidy, 'removed', run.r); pushSeg(tidy, 'added', run.a); run = null; } };
    var small = function (txt) { var w = txt.trim() ? txt.trim().split(/\s+/).length : 0; return w === 0 || (w <= 2 && txt.length <= 14); };
    out.forEach(function (sg, k) {
      var lone = sg.t === 'same' && small(sg.s) && k > 0 && k < out.length - 1 && out[k - 1].t !== 'same' && out[k + 1].t !== 'same';
      if (sg.t === 'same' && !lone) { flush(); pushSeg(tidy, 'same', sg.s); return; }
      if (!run) run = { r: '', a: '' };
      if (lone) { run.r += sg.s; run.a += sg.s; } else if (sg.t === 'removed') run.r += sg.s; else run.a += sg.s;
    });
    flush();
    return tidy;
  }
  function segmentsText(segs, side) {
    var skip = side === 'before' ? 'added' : 'removed';
    return (Array.isArray(segs) ? segs : []).filter(function (x) { return x && x.t !== skip; }).map(function (x) { return String(x.s); }).join('');
  }
  var PB_ASK_ADD = { instagram: 'Send this to someone who needs it.', tiktok: 'Which part hits hardest?' };
  var PB_FOLLOW_ADD = 'Save it and follow for the next one.';
  var PB_CAP_MAX = { instagram: 2200, tiktok: 4000 };
  function sentencesOf(line) { return line.match(/[^.!?]+[.!?]*\s*|[.!?]+\s*/g) || (line ? [line] : []); }
  function tidyLine(s) { return s.replace(/[ \t]{2,}/g, ' ').trim(); }
  function upgradeCaption(platform, caption, ctx) {
    ctx = ctx || {};
    platform = platform === 'tiktok' ? 'tiktok' : 'instagram';
    var banned = PB_BANNED[platform], added = [], removed = [];
    var lines = String(caption == null ? '' : caption).replace(/\r\n?/g, '\n').split('\n');
    var tagsKept = 0;
    lines = lines.map(function (line) {
      var was = line;
      var parts = sentencesOf(line), kept = parts.filter(function (sx) {
        var bait = PostScore.analyzeCaption(sx).bait;
        if (bait.length) { removed.push(sx.trim()); return false; }
        return true;
      });
      if (kept.length !== parts.length) line = kept.join('');
      line = line.replace(/([ \t]*)#([^\s#@.,!?;:]+)/g, function (mm, sp, tag) {
        if (banned.indexOf(tag.toLowerCase()) >= 0 || tagsKept >= 5) { removed.push('#' + tag); return ''; }
        tagsKept += 1;
        return mm;
      });
      return line === was ? { s: line, changed: false } : { s: tidyLine(line), changed: true };
    }).filter(function (l) { return !(l.changed && !l.s); }).map(function (l) { return l.s; });
    var text = lines.join('\n');
    var song = ctx.song && String(ctx.song.title || '').trim() ? ctx.song : null;
    var today = isDay(ctx.today) ? ctx.today : null;
    var adds = [];
    if (song && !hasWords(text, song.title)) {
      var title = String(song.title).trim(), rd = isDay(song.release_day) ? song.release_day : null;
      var out = song.out === true || (rd && today && rd <= today);
      if (out) adds.push('"' + title + '" is out now.');
      else if (rd) adds.push('"' + title + '" is out ' + dayWords(rd) + '.');
    }
    if (!PB_ASK.test(text)) adds.push(PB_ASK_ADD[platform]);
    if (song && today && isDay(song.release_day) && !/\bfollow\b/i.test(text)) {
      var off = daysBetween(song.release_day, today);
      if (off >= -7 && off <= 14) adds.push(PB_FOLLOW_ADD);
    }
    if (adds.length) {
      var all = text.split('\n'), at = all.length;
      while (at > 0 && !all[at - 1].trim()) at -= 1;
      while (at > 0 && /^\s*(?:[#@][^\s]+\s*)+$/.test(all[at - 1])) at -= 1;
      var line2 = adds.join(' ');
      var next = text.trim() ? all.slice(0, at).concat([line2], all.slice(at)) : [line2];
      var cand = next.join('\n');
      if (codePoints(cand).length <= PB_CAP_MAX[platform]) { text = cand; added = adds.slice(); }
    }
    return { after: text, added: added, removed: removed };
  }
  function clamp01(v, dflt) { var x = +v; return isFinite(x) ? Math.max(0, Math.min(1, x)) : dflt; }
  function cropPlan(w, h, platform, fmt, focus) {
    w = +w; h = +h;
    if (!(w > 0 && h > 0)) return null;
    var tall = platform === 'tiktok' || fmt === 'reel' || fmt === 'video';
    var outW = 1080, outH = tall ? 1920 : 1350, ratio = outW / outH, shape = tall ? '9:16' : '4:5';
    var fx = clamp01(focus && focus.x, 0.5), fy = clamp01(focus && focus.y, 0.5);
    var r = w / h, sx = 0, sy = 0, sw = w, sh = h, cut = 'none';
    if (Math.abs(r - ratio) / ratio > 0.01) {
      if (r > ratio) { sw = Math.round(h * ratio); sx = Math.max(0, Math.min(w - sw, Math.round(fx * w - sw / 2))); cut = 'sides'; }
      else { sh = Math.round(w / ratio); sy = Math.max(0, Math.min(h - sh, Math.round(fy * h - sh / 2))); cut = 'top and bottom'; }
    }
    var soft = sw < 1080;
    var note = cut === 'none' ? 'Already the best shape.' : 'Cropped from the ' + cut + ' to ' + shape + '.';
    if (soft) note += ' This photo is smaller than 1080 wide, so it will look soft.';
    return { sx: sx, sy: sy, sw: sw, sh: sh, outW: outW, outH: outH, soft: soft, cut: cut, shape: shape, note: note };
  }
  function frameTimes(seconds) {
    var s = +seconds, out = [];
    if (!(s > 0)) return [0];
    [0.3, 1, 2, 3, s * 0.5, s * 0.9].forEach(function (t) {
      t = Math.round(t * 10) / 10;
      if (t >= 0 && t < s - 0.05 && out.indexOf(t) < 0) out.push(t);
    });
    out.sort(function (a, b) { return a - b; });
    return out.length ? out.slice(0, 6) : [0];
  }
  function analysisRequest(draft, ctx) {
    draft = draft || {}; ctx = ctx || {};
    var platform = draft.platform === 'tiktok' ? 'tiktok' : 'instagram';
    var measured = ctx.measured || measurePost(draft, ctx);
    var m = {};
    Object.keys(measured.items).forEach(function (id) { m[id] = measured.items[id].got; });
    var media = draft.media || {};
    var at = typeof draft.at === 'number' && isFinite(draft.at) ? draft.at : (typeof ctx.now === 'number' ? ctx.now : 0);
    var zp = zoneParts(at, ctx.timeZone || LA);
    var song = draft.song && String(draft.song.title || '').trim() ? draft.song : null;
    var t = ctx.targets || null, b = ctx.best || null;
    return {
      v: 1, platform: platform, format: pbFormat(platform, draft.format), caption: String(draft.caption || '').slice(0, 4000),
      song: song ? { title: String(song.title).slice(0, 200), artists: String(song.artists || '').slice(0, 200), release_day: isDay(song.release_day) ? song.release_day : null, out: !!song.out } : null,
      artist: String(draft.artist || '').slice(0, 120),
      tags: (Array.isArray(draft.tags) ? draft.tags : []).map(function (x) { return String(x).slice(0, 80); }).filter(Boolean).slice(0, 20),
      location: String(draft.location || '').slice(0, 120),
      media: { count: Math.max(0, Math.floor(+media.count || 0)), width: +media.width || 0, height: +media.height || 0, seconds: +media.seconds || 0 },
      measured: m, gate: { capped: !!measured.gate.capped, why: String(measured.gate.why || '') },
      local: { date: zp.date, time: zp.time, weekday: zp.weekday, time_zone: ctx.timeZone || LA, phone_zone: String(ctx.phoneZone || '') },
      best_time: b ? { at: b.at, day: b.day, words: b.words, why: b.why } : null,
      history: t ? { posts: t.n, median: t.median || {}, targets: { views: t.views, likes: t.likes, comments: t.comments, basis: t.basis } } : null
    };
  }
  function cleanWords(v, n) { return typeof v === 'string' ? cutWords(v.replace(/\s+/g, ' ').trim(), n || 200) : ''; }
  function cleanList(v, n) { return (Array.isArray(v) ? v : []).map(function (x) { return cleanWords(x, 200); }).filter(Boolean).slice(0, n || 6); }
  function mergeAnalysis(measured, server, ctx) {
    ctx = ctx || {};
    var draft = ctx.draft || {}, platform = measured.platform, fmt = measured.fmt, rules = pbRules(platform, fmt) || [];
    var srv = server && typeof server === 'object' && !server.error ? server : null;
    var judged = null, gate = { capped: !!measured.gate.capped, why: measured.gate.why || '' };
    if (srv) {
      judged = {};
      var given = {};
      (Array.isArray(srv.items) ? srv.items : []).forEach(function (it) { if (it && typeof it.id === 'string') given[it.id] = it; });
      rules.forEach(function (r) {
        if (r.kind !== 'J') return;
        var it = given[r.id];
        var got = it && isFinite(+it.got) ? intIn(it.got, r.max) : Math.floor(r.max / 2);
        judged[r.id] = { got: got, note: it ? cleanWords(it.note, 200) : '' };
      });
      if (srv.gate && srv.gate.capped === true && !gate.capped) gate = { capped: true, why: cleanWords(srv.gate.why, 200) || 'It looks like mostly someone else\'s material, so the score stops at 40.' };
    }
    var before = String(draft.caption == null ? '' : draft.caption);
    var upCtx = { song: ctx.song || draft.song || null, artist: draft.artist || '', today: ctx.today };
    var after = null;
    if (srv && srv.caption && typeof srv.caption.after === 'string' && srv.caption.after.trim() &&
        codePoints(srv.caption.after).length <= PB_CAP_MAX[platform]) after = srv.caption.after.replace(/\r\n?/g, '\n');
    var up = upgradeCaption(platform, after === null ? before : after, upCtx);
    after = up.after;
    var segs = captionDiff(before, after);
    var mineM = measured;
    var takeM = after === before ? measured : measurePost(Object.assign({}, draft, { caption: after }), ctx.measureCtx || {});
    var fixWords = {};
    if (srv) (Array.isArray(srv.fixes) ? srv.fixes : []).forEach(function (f) { if (f && typeof f.id === 'string' && cleanWords(f.words)) fixWords[f.id] = cleanWords(f.words); });
    var finish = function (res) {
      res.fixes.forEach(function (f) { var r = rules.filter(function (x) { return x.id === f.id; })[0]; if (r && r.kind === 'J' && fixWords[f.id]) f.words = fixWords[f.id]; });
      if (res.fixes.length && res.score < 100) {
        res.why = (res.judged ? '' : 'SIGNAL couldn\'t look at the pictures this time, so it counted the middle. ') + (res.capped ? (res.gateWhy || '') + ' ' : '') + res.fixes[0].words;
        res.why = res.why.replace(/\s+/g, ' ').trim();
      }
      return res;
    };
    var res = finish(scorePost(platform, fmt, takeM, judged, gate));
    var mine = finish(scorePost(platform, fmt, mineM, judged, gate));
    var images = [];
    if (srv && Array.isArray(srv.images)) {
      srv.images.forEach(function (im) {
        if (!im || typeof im !== 'object') return;
        var i = Math.floor(+im.index);
        if (!(i >= 0 && i < 40)) return;
        images.push({ index: i, focus: { x: clamp01(im.focus && im.focus.x, 0.5), y: clamp01(im.focus && im.focus.y, 0.5) }, note: cleanWords(im.note, 200) });
      });
    }
    var video = null;
    if (fmt === 'reel' || fmt === 'video') {
      var meas = [];
      ['length', 'shape'].forEach(function (id) {
        var it = measured.items[id], r = rules.filter(function (x) { return x.id === id; })[0];
        if (!it || !r) return;
        meas.push({ ok: it.got >= r.max, words: it.got >= r.max ? r.full : (it.note || r.half) });
      });
      video = { working: srv && srv.video ? cleanList(srv.video.working, 6) : [], not_working: srv && srv.video ? cleanList(srv.video.not_working, 6) : [], measured: meas, looked: !!srv };
    }
    res.mine = mine;
    res.caption = { before: before, after: after, segments: segs, changed: after !== before, added: up.added, removed: up.removed };
    res.images = images;
    res.video = video;
    res.best = ctx.best || null;
    res.targets = ctx.targets || null;
    res.boost = boostLine(platform, !!(ctx.hasSong || (draft.song && draft.song.title)), fmt);
    res.offline = !srv;
    return res;
  }
  var SONG_RULES = {
    spotify: [
      { id: 'perlistener', label: 'Plays per listener', max: 30, fix: 'More plays per listener: post a clip that sends your own fans back to it, and add an alternate version' },
      { id: 'saves', label: 'Save rate', max: 30, fix: 'More saves: ask for a follow and a save in every post' },
      { id: 'adds', label: 'Playlist adds', max: 15, fix: 'More playlist adds: ask fans to put it on their own playlists' },
      { id: 'other', label: 'Listening from "Other"', max: 10, fix: 'Lower the "Other" share: check Discovered On and the new playlists for bot signs' },
      { id: 'year', label: 'Over 1,000 streams in 12 months', max: 15, fix: 'Get it over 1,000 streams in 12 months: under that it earns no recording royalties' }
    ],
    apple: [
      { id: 'perlistener', label: 'Plays per listener', max: 25, fix: 'More plays per Apple Music listener: post the Promote card so fans play it there' },
      { id: 'usual', label: 'Against your usual song', max: 25, fix: 'Catch up with your usual song: share the Promote card and the pre-add link in the next post' },
      { id: 'shazams', label: 'Shazams', max: 20, fix: 'More Shazams: play it where people hear it out loud, then use the Shazam cities in the next post' },
      { id: 'adds', label: 'Playlist adds', max: 15, fix: 'No playlist adds yet: ask your distributor to file an Apple re-promotion pitch with the new numbers' },
      { id: 'year', label: 'Over 1,000 plays in 12 months', max: 15, fix: 'Get it over 1,000 plays in 12 months' }
    ]
  };
  function numOrNull(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function hasNums(w) { return numOrNull(w.streams) !== null || numOrNull(w.listeners) !== null; }
  function songWindow(song) {
    var all = (song && Array.isArray(song.weeks) ? song.weeks : []).filter(function (w) { return w && isDay(w.week) && hasNums(w); })
      .slice().sort(function (a, b) { return a.week < b.week ? -1 : a.week > b.week ? 1 : 0; });
    var R = song && isDay(song.releaseDay) ? song.releaseDay : null, kind = 'none', weeks = [];
    if (R) {
      weeks = all.filter(function (w) { return addDays(w.week, 6) >= R && w.week <= addDays(R, 27); });
      if (weeks.length) kind = 'first28';
    }
    if (!weeks.length && all.length) { weeks = all.slice(-4); kind = 'latest4'; }
    var sum = { streams: 0, listeners: 0, saves: 0, adds: 0, shazams: 0 }, has = { saves: false, adds: false, shazams: false };
    weeks.forEach(function (w) {
      Object.keys(sum).forEach(function (k) { var n = numOrNull(w[k]); if (n !== null) { sum[k] += n; if (has[k] !== undefined) has[k] = true; } });
    });
    return { kind: kind, weeks: weeks, sum: sum, has: has };
  }
  function perListenerOf(song) {
    var w = songWindow(song);
    return w.sum.listeners > 0 ? w.sum.streams / w.sum.listeners : null;
  }
  function otherShareOf(song, weeks) {
    var on = {};
    (weeks || []).forEach(function (w) { on[w.week] = true; });
    var rows = (song && Array.isArray(song.sources) ? song.sources : []).filter(function (r) { return r && numOrNull(r.streams) !== null && (!weeks || !weeks.length || on[r.week]); });
    if (!rows.length) return null;
    var tot = 0, other = 0;
    rows.forEach(function (r) { tot += r.streams; if (sourceKind(r.name) === 'other') other += r.streams; });
    return tot > 0 ? other / tot : null;
  }
  function songScore(source, song, ctx) {
    ctx = ctx || {};
    var src = source === 'apple' ? 'apple' : 'spotify', rules = SONG_RULES[src], win = songWindow(song), s = win.sum;
    var title = String(song && song.title || '');
    if (win.kind === 'none' || (!(s.listeners > 0) && !(s.streams > 0))) {
      return { score: null, band: null, needsFile: true, window: 'none', items: [], fixes: [], why: 'It needs this week’s file.', numbers: {} };
    }
    var per = s.listeners > 0 ? s.streams / s.listeners : null;
    var others = (ctx.others || []).filter(function (o) { return o && String(o.title || '') !== title; });
    var today = isDay(ctx.today) ? ctx.today : null;
    var year = numOrNull(song.streams12m), yearKnown = year !== null, yearWeeks = 0;
    if (year === null) {
      var since = today ? addDays(today, -364) : null;
      year = 0;
      (song.weeks || []).forEach(function (w) {
        if (w && isDay(w.week) && (!since || w.week >= since) && numOrNull(w.streams) !== null) { year += w.streams; yearWeeks += 1; }
      });
      yearKnown = year >= 1000 || yearWeeks >= 40;
    }
    var yearUnit = src === 'spotify' ? ' streams in 12 months' : ' plays in 12 months';
    var putYear = function () {
      if (!yearKnown) put('year', 8, 'Not known yet: the weeks SIGNAL has add up to ' + commas(year));
      else put('year', year >= 1000 ? 15 : 0, commas(year) + yearUnit);
    };
    var got = {}, note = {};
    var put = function (id, g, n) { got[id] = g; note[id] = n || ''; };
    if (src === 'spotify') {
      put('perlistener', per === null ? 8 : per >= 3 ? 30 : per >= 2 ? 20 : 8, per === null ? 'No listeners in the file' : per.toFixed(1) + ' plays per listener');
      var sr = s.listeners > 0 && win.has.saves ? s.saves / s.listeners : null;
      put('saves', sr === null ? 15 : sr >= 0.10 ? 30 : sr >= 0.05 ? 18 : 6, sr === null ? 'Saves not in the file yet, so it counts the middle' : Math.round(sr * 1000) / 10 + '% of listeners saved it');
      var ar = s.listeners > 0 && win.has.adds ? s.adds / s.listeners : null;
      var arOthers = others.map(function (o) { var w = songWindow(o); return w.sum.listeners > 0 && w.has.adds ? w.sum.adds / w.sum.listeners : null; })
        .filter(function (x) { return x !== null; });
      if (ar === null) put('adds', 7, 'Playlist adds not in the file yet, so it counts the middle');
      else if (arOthers.length + 1 >= 3) {
        var med = median(arOthers.concat([ar])), rr = med > 0 ? ar / med : (ar > 0 ? 2 : 1);
        put('adds', rr >= 1.2 ? 15 : rr >= 0.8 ? 10 : 5, rr >= 1.2 ? 'Above your usual song' : rr >= 0.8 ? 'About your usual song' : 'Below your usual song');
      } else put('adds', ar >= 0.02 ? 15 : ar >= 0.01 ? 10 : 5, Math.round(ar * 1000) / 10 + ' adds per 100 listeners');
      var os = otherShareOf(song, win.weeks);
      put('other', os === null ? 5 : os < 0.08 ? 10 : os <= 0.12 ? 5 : 0, os === null ? 'Not known yet' : Math.round(os * 100) + '% of the listening');
      putYear();
    } else {
      var sp = ctx.spotify ? perListenerOf(ctx.spotify) : null;
      if (per === null) put('perlistener', 5, 'No listeners in the file');
      else if (sp !== null && sp > 0) {
        var vs = per / sp;
        put('perlistener', vs >= 1.1 ? 25 : vs >= 0.9 ? 15 : 5, per.toFixed(1) + ' per listener, ' + (vs >= 1.1 ? 'above' : vs >= 0.9 ? 'about the same as' : 'below') + ' Spotify’s ' + sp.toFixed(1));
      } else put('perlistener', per >= 3 ? 25 : per >= 2 ? 15 : 5, per.toFixed(1) + ' plays per listener');
      var plays = others.map(function (o) { var w = songWindow(o); return w.kind === 'none' ? null : w.sum.streams; }).filter(function (x) { return x !== null; });
      if (plays.length + 1 >= 3) {
        var m2 = median(plays.concat([s.streams])), r2 = m2 > 0 ? s.streams / m2 : 1;
        put('usual', r2 >= 1.2 ? 25 : r2 >= 0.8 ? 15 : 5, r2 >= 1.2 ? 'Above your usual song' : r2 >= 0.8 ? 'About your usual song' : 'Below your usual song');
      } else put('usual', 15, 'Not enough songs yet to compare');
      var shz = (song.weeks || []).filter(function (w) { return w && isDay(w.week) && numOrNull(w.shazams) !== null; })
        .slice().sort(function (a, b) { return a.week < b.week ? -1 : 1; });
      var shTot = shz.reduce(function (t, w) { return t + w.shazams; }, 0);
      if (!shTot) put('shazams', 0, 'No Shazams yet');
      else if (shz.length < 2) put('shazams', 10, commas(shTot) + ' Shazams');
      else {
        var last = shz[shz.length - 1].shazams, prev = shz[shz.length - 2].shazams;
        put('shazams', last > prev ? 20 : 10, last > prev ? 'Rising week over week' : 'Flat or falling week over week');
      }
      put('adds', win.has.adds && s.adds > 0 ? 15 : 0, win.has.adds && s.adds > 0 ? commas(s.adds) + ' playlist adds' : 'No playlist adds');
      putYear();
    }
    var items = rules.map(function (r) { return { id: r.id, label: r.label, max: r.max, got: Math.max(0, Math.min(r.max, got[r.id] || 0)), note: note[r.id] }; });
    var score = items.reduce(function (t, it) { return t + it.got; }, 0);
    var fixes = items.filter(function (it) { return it.got < it.max; }).map(function (it) {
      var r = rules.filter(function (x) { return x.id === it.id; })[0];
      return { id: it.id, pts: it.max - it.got, words: r.fix };
    }).sort(function (a, b) { return b.pts - a.pts; });
    var band = meterBand(score);
    return {
      score: band.score, band: band, needsFile: false, window: win.kind, items: items, fixes: fixes,
      why: fixes.length ? fixes[0].words : 'It’s at Peak. Keep sharing it so the numbers hold.',
      numbers: { streams: s.streams, listeners: s.listeners, perListener: per, saveRate: s.listeners > 0 && win.has.saves ? s.saves / s.listeners : null,
        addRate: s.listeners > 0 && win.has.adds ? s.adds / s.listeners : null, adds: win.has.adds ? s.adds : null,
        otherShare: src === 'spotify' ? otherShareOf(song, win.weeks) : null, shazams: win.has.shazams ? s.shazams : null, year: year }
    };
  }
  var TODO_PITCH = { spotify: { masterpitch: true, spotify: true }, apple: { brief: true, applepitchnotes: true } };
  function todoList(release, steps, platform, today) {
    var plat = platform === 'apple' ? 'apple' : 'spotify', R = release && isDay(release.release_day) ? release.release_day : null;
    var mine = (steps || []).filter(function (s) {
      return s && (!release || s.release_id === release.id) && (s.platform === plat || s.platform === 'all') && s.status !== 'skipped';
    }).slice().sort(function (a, b) {
      var x = a.due_day || '9999', y = b.due_day || '9999';
      return x < y ? -1 : x > y ? 1 : (a.sort_order || 0) - (b.sort_order || 0);
    });
    var out = { before: [], after: [], done: 0, of: mine.length };
    mine.forEach(function (s) {
      var due = isDay(s.due_day) ? s.due_day : null, done = s.status === 'done';
      var it = { id: s.id, rule: s.rule || '', title: String(s.title || ''), due: due, status: s.status || 'todo', done: done,
        overdue: !done && (s.status === 'todo' || s.status === 'waiting' || !s.status) && !!due && isDay(today) && due < today,
        needsOk: !!s.needs_ok, who: s.who === 'distributor' ? 'distributor' : 'me', platform: s.platform, pitch: !!TODO_PITCH[plat][s.rule] };
      if (done) out.done += 1;
      (R && due && due >= R ? out.after : out.before).push(it);
    });
    return out;
  }
  root.GSIG = {
    SCORER_VERSION: SCORER_VERSION, METER_VERSION: METER_VERSION,
    addDays: addDays, daysBetween: daysBetween, weekdayOf: weekdayOf, mondayOf: mondayOf, isDay: isDay, dayWords: dayWords, dueWords: dueWords,
    pacificParts: pacificParts, pacificInstant: pacificInstant, postWhen: postWhen, codePoints: codePoints,
    PostScore: PostScore, PitchScore: PitchScore,
    PLATFORMS: PLATFORMS, EVENTS: EVENTS, RELEASE_STEPS: RELEASE_STEPS, planRelease: planRelease, releaseSpacing: releaseSpacing, spotifySlot: spotifySlot,
    median: median, sourceKind: sourceKind, songDoctor: songDoctor, under1000: under1000, streamCheckup: streamCheckup,
    TEST_GAP: TEST_GAP, cityKey: cityKey, cityTable: cityTable,
    weekly: weekly, urgency: urgency, POST_RESULT_FIELDS: POST_RESULT_FIELDS, POST_CHECKLIST: POST_CHECKLIST,
    CSV_FIELDS: CSV_FIELDS, csvColumns: csvColumns, csvNumber: csvNumber, csvDay: csvDay, readCsv: readCsv, csvSnapshots: csvSnapshots,
    PLAYBOOK_VERSION: PLAYBOOK_VERSION, PB_RULES: PB_RULES, PB_PLATFORMS: PB_PLATFORMS, METER_BANDS: METER_BANDS, meterBand: meterBand,
    pbFormat: pbFormat, pbRules: pbRules, captionChecks: captionChecks, zoneParts: zoneParts, postWindows: postWindows, timePoints: timePoints,
    bestTime: bestTime, windowWords: windowWords, zoneInstant: zoneInstant, bestInstant: bestInstant, measurePost: measurePost, scorePost: scorePost, postTargets: postTargets, boostLine: boostLine,
    utf8Bytes: utf8Bytes, packAnswers: packAnswers, readAnswers: readAnswers, postResult: postResult,
    captionDiff: captionDiff, segmentsText: segmentsText, upgradeCaption: upgradeCaption, cropPlan: cropPlan, frameTimes: frameTimes,
    analysisRequest: analysisRequest, mergeAnalysis: mergeAnalysis, PB_ASK_ADD: PB_ASK_ADD, PB_FOLLOW_ADD: PB_FOLLOW_ADD,
    SONG_RULES: SONG_RULES, songWindow: songWindow, songScore: songScore, todoList: todoList
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
