var App = {
  videoElement: null,
  previewCanvas: null,
  processingCanvas: null,
  state: 'loading',
  animInterval: null,
  trimStart: 0,
  trimEnd: 0,
  allFrames: [],

  async init() {
    this.videoElement = document.getElementById('webcam');
    this.previewCanvas = document.getElementById('preview-canvas');
    this.processingCanvas = document.getElementById('processing-canvas');

    try {
      // Start webcam
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      // Init segmenter
      await Segmenter.init();

      // Start live preview
      this.setState('previewing');
      this.runLivePreview();
      this.bindEvents();

    } catch (err) {
      document.getElementById('loading-overlay').innerHTML =
        '<p style="color:#e74c3c;">오류: ' + err.message + '</p>' +
        '<p style="color:#888;margin-top:8px;">웹캠 권한을 허용해주세요.</p>';
    }
  },

  async runLivePreview() {
    if (this.state !== 'previewing' && this.state !== 'countdown') return;

    try {
      var people = await Segmenter.segmentFrame(this.videoElement);
      var mask = await Segmenter.createSilhouetteMask(
        people,
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 0, g: 0, b: 0, a: 0 }
      );
      Segmenter.drawLivePreview(this.previewCanvas, this.videoElement, mask);
    } catch (e) {
      // skip frame on error
    }

    var self = this;
    requestAnimationFrame(function() { self.runLivePreview(); });
  },

  bindEvents() {
    var self = this;

    // Record button
    document.getElementById('btn-record').addEventListener('click', function() {
      self.startRecordingFlow();
    });

    // Snapshot button
    document.getElementById('btn-snapshot').addEventListener('click', function() {
      self.takeSnapshot();
    });

    // Snapshot save buttons
    document.getElementById('btn-snapshot-png').addEventListener('click', function() {
      self.saveSnapshot('png');
    });
    document.getElementById('btn-snapshot-webp').addEventListener('click', function() {
      self.saveSnapshot('webp');
    });

    // Snapshot close
    document.getElementById('btn-snapshot-close').addEventListener('click', function() {
      document.getElementById('snapshot-section').classList.add('hidden');
      self.setState('previewing');
      self.runLivePreview();
    });

    // Record again
    document.getElementById('btn-again').addEventListener('click', function() {
      document.getElementById('review-section').classList.add('hidden');
      document.getElementById('recording-status').classList.add('hidden');
      if (self.animInterval) clearInterval(self.animInterval);
      self.setState('previewing');
      self.runLivePreview();
    });

    // Duration buttons
    document.querySelectorAll('#duration-group button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#duration-group button').forEach(function(b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        Recorder.settings.duration = parseInt(btn.dataset.value);
      });
    });

    // Background buttons
    document.querySelectorAll('#bg-group button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#bg-group button').forEach(function(b) {
          b.classList.remove('active');
        });
        btn.classList.add('active');
        Recorder.settings.bgMode = btn.dataset.value;
      });
    });

    // Trim sliders
    var trimStartEl = document.getElementById('trim-start');
    var trimEndEl = document.getElementById('trim-end');

    function onTrimChange() {
      var s = parseInt(trimStartEl.value);
      var e = parseInt(trimEndEl.value);
      if (s > e) { s = e; trimStartEl.value = s; }
      self.trimStart = s;
      self.trimEnd = e;
      self.updateTrimUI();
    }

    trimStartEl.addEventListener('input', onTrimChange);
    trimEndEl.addEventListener('input', onTrimChange);

    // Apply trim
    document.getElementById('btn-apply-trim').addEventListener('click', function() {
      self.applyTrim();
    });

    // Export buttons (use trimmed frames)
    document.getElementById('btn-export-png').addEventListener('click', function() {
      Exporter.exportPngZip(self.getTrimmedFrames());
    });

    document.getElementById('btn-export-webp').addEventListener('click', function() {
      var w = self.videoElement.videoWidth;
      var h = self.videoElement.videoHeight;
      Exporter.exportWebp(self.getTrimmedFrames(), w, h, Recorder.settings.fps);
    });

    document.getElementById('btn-export-gif').addEventListener('click', function() {
      var w = self.videoElement.videoWidth;
      var h = self.videoElement.videoHeight;
      Exporter.exportGif(self.getTrimmedFrames(), w, h, Recorder.settings.fps);
    });

    document.getElementById('btn-export-sprite').addEventListener('click', function() {
      var w = self.videoElement.videoWidth;
      var h = self.videoElement.videoHeight;
      Exporter.exportSpriteSheet(self.getTrimmedFrames(), w, h, Recorder.settings.fps);
    });
  },

  async startRecordingFlow() {
    var self = this;
    var countdownOverlay = document.getElementById('countdown-overlay');
    var countdownDisplay = document.getElementById('countdown-display');
    var recordingStatus = document.getElementById('recording-status');
    var progressFill = document.getElementById('progress-fill');
    var recordingInfo = document.getElementById('recording-info');

    // Countdown
    this.setState('countdown');
    countdownOverlay.classList.remove('hidden');

    await Recorder.startCountdown(function(n) {
      countdownDisplay.textContent = n > 0 ? n : 'REC';
    });

    // Recording
    countdownOverlay.classList.add('hidden');
    this.setState('recording');
    recordingStatus.classList.remove('hidden');
    progressFill.style.width = '0%';

    var frames = await Recorder.startRecording(
      this.videoElement,
      this.processingCanvas,
      function(current, total) {
        var pct = (current / total * 100).toFixed(0);
        progressFill.style.width = pct + '%';
        recordingInfo.textContent = current + ' / ' + total + ' 프레임';
      }
    );

    // Review
    this.setState('review');
    recordingStatus.classList.add('hidden');
    this.showReview(frames);
  },

  getTrimmedFrames: function() {
    return this.allFrames.slice(this.trimStart, this.trimEnd + 1);
  },

  updateTrimUI: function() {
    var total = this.allFrames.length;
    if (total === 0) return;

    var s = this.trimStart;
    var e = this.trimEnd;
    var count = e - s + 1;

    // Update labels
    document.getElementById('trim-start-label').textContent = '시작: ' + s;
    document.getElementById('trim-end-label').textContent = '끝: ' + e;
    document.getElementById('trim-count').textContent = count + '프레임 선택됨';

    // Update range highlight
    var range = document.getElementById('trim-range');
    range.style.left = (s / (total - 1) * 100) + '%';
    range.style.width = ((e - s) / (total - 1) * 100) + '%';

    // Update thumbnail highlights
    var thumbs = document.querySelectorAll('#frame-preview .frame-thumbnail');
    thumbs.forEach(function(thumb, i) {
      thumb.classList.toggle('trimmed-out', i < s || i > e);
      thumb.classList.toggle('in-range', i >= s && i <= e);
    });

    // Update frame info
    var trimmed = this.getTrimmedFrames();
    var totalSize = 0;
    trimmed.forEach(function(f) { totalSize += f.blob.size; });
    document.getElementById('frame-info').textContent =
      count + '/' + total + ' 프레임 | ' +
      trimmed[0].imageData.width + 'x' + trimmed[0].imageData.height + ' | ' +
      (totalSize / 1024 / 1024).toFixed(1) + ' MB';

    // Update animation to only play trimmed range
    this.playAnimation(trimmed);
  },

  applyTrim: function() {
    this.allFrames = this.getTrimmedFrames();
    Recorder.frames = this.allFrames;
    this.trimStart = 0;
    this.trimEnd = this.allFrames.length - 1;

    var trimStartEl = document.getElementById('trim-start');
    var trimEndEl = document.getElementById('trim-end');
    trimStartEl.max = this.allFrames.length - 1;
    trimEndEl.max = this.allFrames.length - 1;
    trimStartEl.value = 0;
    trimEndEl.value = this.allFrames.length - 1;

    this.showReview(this.allFrames);
  },

  playAnimation: function(frames) {
    var canvas = document.getElementById('animation-canvas');
    var ctx = canvas.getContext('2d');
    canvas.width = frames[0].imageData.width;
    canvas.height = frames[0].imageData.height;

    var i = 0;
    if (this.animInterval) clearInterval(this.animInterval);
    this.animInterval = setInterval(function() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(frames[i].imageData, 0, 0);
      i = (i + 1) % frames.length;
    }, 1000 / Recorder.settings.fps);
  },

  showReview: function(frames) {
    this.allFrames = frames;
    this.trimStart = 0;
    this.trimEnd = frames.length - 1;

    var reviewSection = document.getElementById('review-section');
    reviewSection.classList.remove('hidden');

    // Setup trim sliders
    var trimStartEl = document.getElementById('trim-start');
    var trimEndEl = document.getElementById('trim-end');
    trimStartEl.max = frames.length - 1;
    trimEndEl.max = frames.length - 1;
    trimStartEl.value = 0;
    trimEndEl.value = frames.length - 1;

    // Frame info
    var totalSize = 0;
    frames.forEach(function(f) { totalSize += f.blob.size; });
    document.getElementById('frame-info').textContent =
      frames.length + '프레임 | ' +
      frames[0].imageData.width + 'x' + frames[0].imageData.height + ' | ' +
      (totalSize / 1024 / 1024).toFixed(1) + ' MB';

    document.getElementById('trim-start-label').textContent = '시작: 0';
    document.getElementById('trim-end-label').textContent = '끝: ' + (frames.length - 1);
    document.getElementById('trim-count').textContent = frames.length + '프레임 선택됨';

    // Range bar
    var range = document.getElementById('trim-range');
    range.style.left = '0%';
    range.style.width = '100%';

    // Thumbnails
    var container = document.getElementById('frame-preview');
    container.innerHTML = '';
    frames.forEach(function(frame) {
      var img = document.createElement('img');
      img.src = URL.createObjectURL(frame.blob);
      img.className = 'frame-thumbnail in-range';
      container.appendChild(img);
    });

    // Animation
    this.playAnimation(frames);
  },

  takeSnapshot: async function() {
    var self = this;
    var countdownOverlay = document.getElementById('countdown-overlay');
    var countdownDisplay = document.getElementById('countdown-display');

    this.setState('countdown');
    countdownOverlay.classList.remove('hidden');

    await Recorder.startCountdown(function(n) {
      countdownDisplay.textContent = n > 0 ? n : '';
    });

    countdownOverlay.classList.add('hidden');

    var fgColor = Recorder.getFgColor();
    var bgColor = Recorder.getBgColor();

    var people = await Segmenter.segmentFrame(this.videoElement);
    var mask = await Segmenter.createSilhouetteMask(people, fgColor, bgColor);

    var canvas = document.getElementById('snapshot-canvas');
    var ctx = canvas.getContext('2d');
    canvas.width = mask.width;
    canvas.height = mask.height;
    ctx.putImageData(mask, 0, 0);

    this._snapshotCanvas = canvas;
    document.getElementById('snapshot-section').classList.remove('hidden');
    this.setState('snapshot');
  },

  saveSnapshot: function(format) {
    var canvas = this._snapshotCanvas;
    var mimeType = format === 'webp' ? 'image/webp' : 'image/png';
    var ext = format === 'webp' ? '.webp' : '.png';

    canvas.toBlob(function(blob) {
      Exporter.downloadBlob(blob, 'silhouette' + ext);
    }, mimeType, 0.95);
  },

  setState: function(state) {
    this.state = state;
    document.body.dataset.state = state;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  App.init();
});
