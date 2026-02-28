const Exporter = {

  timestamp: function() {
    var d = new Date();
    return d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '_' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0') +
      String(d.getSeconds()).padStart(2, '0');
  },

  async exportPngZip(frames, filename) {
    filename = filename || ('silhouettes_' + this.timestamp());
    const zip = new JSZip();
    const folder = zip.folder(filename);

    frames.forEach(function(frame, i) {
      var paddedIndex = String(i).padStart(4, '0');
      folder.file('frame_' + paddedIndex + '.png', frame.blob);
    });

    var content = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(content, filename + '.zip');
  },

  async exportWebp(frames, width, height, fps) {
    fps = fps || 10;
    var delay = 1000 / fps;

    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    var ctx = tempCanvas.getContext('2d');

    // Use WebCodecs API if available for animated WebP
    if (typeof VideoEncoder !== 'undefined') {
      await this._exportWebpViaVideo(frames, width, height, fps);
      return;
    }

    // Fallback: encode each frame as WebP, pack into ZIP
    var zip = new JSZip();
    var folder = zip.folder('silhouettes_webp_' + this.timestamp());

    for (var i = 0; i < frames.length; i++) {
      ctx.clearRect(0, 0, width, height);
      ctx.putImageData(frames[i].imageData, 0, 0);
      var dataUrl = tempCanvas.toDataURL('image/webp', 0.9);
      var base64 = dataUrl.split(',')[1];
      var paddedIndex = String(i).padStart(4, '0');
      folder.file('frame_' + paddedIndex + '.webp', base64, { base64: true });
    }

    var content = await zip.generateAsync({ type: 'blob' });
    this.downloadBlob(content, 'silhouettes_webp_' + this.timestamp() + '.zip');
  },

  async _exportWebpViaVideo(frames, width, height, fps) {
    // Create animated WebP via canvas.captureStream + MediaRecorder
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    var ctx = tempCanvas.getContext('2d');

    var stream = tempCanvas.captureStream(0);
    var recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 2000000
    });

    var chunks = [];
    recorder.ondataavailable = function(e) {
      if (e.data.size > 0) chunks.push(e.data);
    };

    var delay = 1000 / fps;

    return new Promise(function(resolve) {
      recorder.onstop = function() {
        var blob = new Blob(chunks, { type: 'video/webm' });
        Exporter.downloadBlob(blob, 'silhouette_' + Exporter.timestamp() + '.webm');
        resolve();
      };

      recorder.start();

      var i = 0;
      var drawNext = function() {
        if (i >= frames.length) {
          recorder.stop();
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.putImageData(frames[i].imageData, 0, 0);
        var track = stream.getVideoTracks()[0];
        if (track.requestFrame) track.requestFrame();
        i++;
        setTimeout(drawNext, delay);
      };
      drawNext();
    });
  },

  async exportGif(frames, width, height, fps) {
    fps = fps || 10;

    var workerResponse = await fetch(
      'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js'
    );
    var workerBlob = await workerResponse.blob();
    var workerUrl = URL.createObjectURL(workerBlob);

    var gif = new GIF({
      workers: 2,
      workerScript: workerUrl,
      quality: 10,
      width: width,
      height: height,
      transparent: 0x00000000
    });

    var delay = 1000 / fps;
    var tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    var ctx = tempCanvas.getContext('2d');

    for (var i = 0; i < frames.length; i++) {
      ctx.clearRect(0, 0, width, height);
      ctx.putImageData(frames[i].imageData, 0, 0);
      gif.addFrame(ctx, { copy: true, delay: delay });
    }

    return new Promise(function(resolve) {
      gif.on('finished', function(blob) {
        URL.revokeObjectURL(workerUrl);
        Exporter.downloadBlob(blob, 'silhouette_' + Exporter.timestamp() + '.gif');
        resolve();
      });
      gif.render();
    });
  },

  async exportSpriteSheet(frames, frameWidth, frameHeight, fps) {
    fps = fps || 10;
    var cols = Math.ceil(Math.sqrt(frames.length));
    var rows = Math.ceil(frames.length / cols);

    var sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = frameWidth * cols;
    sheetCanvas.height = frameHeight * rows;
    var ctx = sheetCanvas.getContext('2d');

    for (var i = 0; i < frames.length; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      ctx.putImageData(
        frames[i].imageData,
        col * frameWidth,
        row * frameHeight
      );
    }

    await new Promise(function(resolve) {
      sheetCanvas.toBlob(function(blob) {
        Exporter.downloadBlob(blob, 'spritesheet_' + Exporter.timestamp() + '.png');
        resolve();
      }, 'image/png');
    });

    var meta = {
      frameWidth: frameWidth,
      frameHeight: frameHeight,
      cols: cols,
      rows: rows,
      totalFrames: frames.length,
      fps: fps
    };
    var metaBlob = new Blob(
      [JSON.stringify(meta, null, 2)],
      { type: 'application/json' }
    );
    this.downloadBlob(metaBlob, 'spritesheet_' + this.timestamp() + '.json');
  },

  downloadBlob: function(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
